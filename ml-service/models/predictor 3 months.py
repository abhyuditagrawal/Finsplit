import pandas as pd
import numpy as np
from prophet import Prophet
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import pickle
import os

class ExpensePredictor:
    """Time series prediction for expense forecasting"""
    
    def __init__(self):
        self.model = None
        self.model_path = 'saved_models/'
        os.makedirs(self.model_path, exist_ok=True)
    
    def train_and_predict(self, processed_data, periods=12):
        """
        Train Prophet model and generate predictions
        
        Args:
            processed_data: Output from DataProcessor
            periods: Number of months to predict (default: 12)
            
        Returns:
            dict: Predictions with confidence intervals
        """
        monthly_data = processed_data['monthly_totals']
        stats = processed_data['stats']
        
        # Check minimum data requirement
        if stats['months_of_data'] < 3:
            return {
                'success': False,
                'error': 'Insufficient data',
                'message': f"Need at least 3 months of data. You have {stats['months_of_data']} months.",
                'suggestion': 'Add more expenses or import historical data'
            }
        
        # Prepare data for Prophet
        df = pd.DataFrame(monthly_data)
        df['ds'] = pd.to_datetime(df['month'].astype(str))
        df['y'] = df['total']
        prophet_df = df[['ds', 'y']]
        
        # Initialize and train Prophet model
        self.model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            changepoint_prior_scale=0.05,
            seasonality_prior_scale=10.0,
            interval_width=0.85
        )
        
        # Train model
        self.model.fit(prophet_df)
        
        # Generate future dates
        future = self.model.make_future_dataframe(periods=periods, freq='M')
        
        # Make predictions
        forecast = self.model.predict(future)
        
        # Extract predictions
        predictions = self._extract_predictions(forecast, periods, stats)
        
        # Add category-wise predictions
        category_predictions = self._predict_categories(
            processed_data.get('category_breakdown', {}),
            predictions['monthly']['next_month']['predicted_amount']
        )
        
        predictions['monthly']['next_month']['category_breakdown'] = category_predictions
        
        return predictions
    
    def _extract_predictions(self, forecast, periods, stats):
        """Extract and format predictions from Prophet forecast"""
        
        # Get only future predictions (last 'periods' rows)
        future_predictions = forecast.tail(periods)
        
        # Next month prediction
        next_month = future_predictions.iloc[0]
        
        # Ensure predictions are non-negative and reasonable
        predicted_amount = max(float(next_month['yhat']), 0)
        min_amount = max(float(next_month['yhat_lower']), 0)
        max_amount = max(float(next_month['yhat_upper']), predicted_amount)
        
        # If prediction seems unrealistic, use average instead
        if predicted_amount == 0 or predicted_amount > stats['average_monthly'] * 3:
            predicted_amount = stats['average_monthly']
            min_amount = predicted_amount * 0.8
            max_amount = predicted_amount * 1.2
        
        # Next 3 months
        next_3_months = []
        for i in range(min(3, len(future_predictions))):
            pred = future_predictions.iloc[i]
            amount = max(float(pred['yhat']), 0)
            if amount == 0 or amount > stats['average_monthly'] * 3:
                amount = stats['average_monthly']
            
            next_3_months.append({
                'month': pred['ds'].strftime('%Y-%m'),
                'amount': round(amount, 2),
                'min': round(max(float(pred['yhat_lower']), amount * 0.8), 2),
                'max': round(max(float(pred['yhat_upper']), amount * 1.2), 2)
            })
        
        # Next 6 months
        next_6_months = []
        for i in range(min(6, len(future_predictions))):
            pred = future_predictions.iloc[i]
            amount = max(float(pred['yhat']), 0)
            if amount == 0 or amount > stats['average_monthly'] * 3:
                amount = stats['average_monthly']
            
            next_6_months.append({
                'month': pred['ds'].strftime('%Y-%m'),
                'amount': round(amount, 2),
                'min': round(max(float(pred['yhat_lower']), amount * 0.8), 2),
                'max': round(max(float(pred['yhat_upper']), amount * 1.2), 2)
            })
        
        # Yearly prediction (sum of next 12 months or use average * 12)
        yearly_predictions = []
        for i in range(min(12, len(future_predictions))):
            pred_val = max(float(future_predictions.iloc[i]['yhat']), 0)
            if pred_val == 0 or pred_val > stats['average_monthly'] * 3:
                pred_val = stats['average_monthly']
            yearly_predictions.append(pred_val)
        
        yearly_total = sum(yearly_predictions)
        if len(yearly_predictions) < 12:
            # Fill remaining months with average
            yearly_total += stats['average_monthly'] * (12 - len(yearly_predictions))
        
        # Format predictions
        predictions = {
            'success': True,
            'monthly': {
                'next_month': {
                    'month': next_month['ds'].strftime('%Y-%m'),
                    'predicted_amount': round(predicted_amount, 2),
                    'confidence': {
                        'min': round(min_amount, 2),
                        'max': round(max_amount, 2),
                        'confidence_level': 0.85
                    }
                },
                'next_3_months': next_3_months,
                'next_6_months': next_6_months
            },
            'yearly': {
                'next_12_months': round(yearly_total, 2),
                'average_monthly': round(yearly_total / 12, 2),
                'compared_to_current': round(
                    ((yearly_total / 12) - stats['average_monthly']) / stats['average_monthly'] * 100, 
                    1
                ) if stats['average_monthly'] > 0 else 0
            },
            'insights': self._generate_insights(stats, predicted_amount),
            'model_info': {
                'algorithm': 'Facebook Prophet',
                'data_points': stats['months_of_data'],
                'last_trained': datetime.now().isoformat(),
                'confidence_level': '85%'
            }
        }
        
        return predictions
    
    def _predict_categories(self, category_breakdown, next_month_total):
        """Predict spending by category for next month"""
        
        if not category_breakdown:
            return {}
        
        # Calculate average percentages for each category
        category_percentages = {}
        
        # Convert category breakdown to DataFrame
        df = pd.DataFrame(category_breakdown).T
        
        # Calculate average percentage for each category
        for col in df.columns:
            avg_amount = df[col].mean()
            category_percentages[col] = avg_amount
        
        # Calculate total to get percentages
        total = sum(category_percentages.values())
        
        # Apply percentages to predicted amount
        predictions = {}
        for category, avg_amount in category_percentages.items():
            percentage = (avg_amount / total) if total > 0 else 0
            predicted_amount = next_month_total * percentage
            predictions[category] = round(predicted_amount, 2)
        
        return predictions
    
    def _generate_insights(self, stats, next_month_prediction):
        """Generate human-readable insights"""
        
        insights = []
        
        # Trend insight
        avg_monthly = stats['average_monthly']
        change = ((next_month_prediction - avg_monthly) / avg_monthly) * 100 if avg_monthly > 0 else 0
        
        if change > 5:
            insights.append(f"📈 Your spending is expected to increase by {abs(change):.1f}% next month")
        elif change < -5:
            insights.append(f"📉 Your spending is expected to decrease by {abs(change):.1f}% next month")
        else:
            insights.append(f"📊 Your spending is expected to remain stable next month")
        
        # Data quality insight
        if stats['months_of_data'] >= 6:
            insights.append(f"✅ High confidence prediction based on {stats['months_of_data']} months of data")
        else:
            insights.append(f"⚠️ Moderate confidence - add more expenses for better predictions")
        
        return insights
