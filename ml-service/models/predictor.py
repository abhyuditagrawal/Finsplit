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
        Works with ANY amount of data (even < 3 months)
        """
        monthly_data = processed_data['monthly_totals']
        stats = processed_data['stats']
        
        # NEW: Works with any amount of data!
        if stats['months_of_data'] < 1:
            return {
                'success': False,
                'error': 'Insufficient data',
                'message': 'No expense data found',
                'suggestion': 'Add some expenses to see predictions'
            }
        
        # If less than 3 months, use simple moving average prediction
        if stats['months_of_data'] < 3:
            return self._simple_prediction(processed_data, periods)
        
        # If 3+ months, use Prophet (advanced ML)
        return self._prophet_prediction(processed_data, periods)
    
    def _simple_prediction(self, processed_data, periods):
        """Simple average-based prediction for < 3 months of data"""
        monthly_data = processed_data['monthly_totals']
        stats = processed_data['stats']
        
        avg_monthly = stats['average_monthly']
        
        # Generate predictions based on average
        next_month = datetime.now() + relativedelta(months=1)
        
        predictions = {
            'success': True,
            'monthly': {
                'next_month': {
                    'month': next_month.strftime('%Y-%m'),
                    'predicted_amount': round(avg_monthly, 2),
                    'confidence': {
                        'min': round(avg_monthly * 0.8, 2),
                        'max': round(avg_monthly * 1.2, 2),
                        'confidence_level': 0.70  # Lower confidence for less data
                    }
                },
                'next_3_months': [
                    {
                        'month': (next_month + relativedelta(months=i)).strftime('%Y-%m'),
                        'amount': round(avg_monthly, 2),
                        'min': round(avg_monthly * 0.8, 2),
                        'max': round(avg_monthly * 1.2, 2)
                    }
                    for i in range(3)
                ],
                'next_6_months': [
                    {
                        'month': (next_month + relativedelta(months=i)).strftime('%Y-%m'),
                        'amount': round(avg_monthly, 2),
                        'min': round(avg_monthly * 0.8, 2),
                        'max': round(avg_monthly * 1.2, 2)
                    }
                    for i in range(6)
                ]
            },
            'yearly': {
                'next_12_months': round(avg_monthly * 12, 2),
                'average_monthly': round(avg_monthly, 2),
                'compared_to_current': 0.0
            },
            'insights': [
                f" Predictions based on {stats['months_of_data']} month(s) of data",
                f" Average spending: ₹{round(avg_monthly):,}/month",
                " Add more months of data for better predictions"
            ],
            'model_info': {
                'algorithm': 'Simple Moving Average (Limited Data)',
                'data_points': stats['months_of_data'],
                'last_trained': datetime.now().isoformat(),
                'confidence_level': '70%'
            }
        }
        
        # Add category predictions
        category_predictions = self._predict_categories(
            processed_data.get('category_breakdown', {}),
            avg_monthly
        )
        predictions['monthly']['next_month']['category_breakdown'] = category_predictions
        
        return predictions
    
    def _prophet_prediction(self, processed_data, periods):
        """Advanced Prophet prediction for 3+ months of data"""
        monthly_data = processed_data['monthly_totals']
        stats = processed_data['stats']
        
        # Prepare data for Prophet
        df = pd.DataFrame(monthly_data)
        df['ds'] = pd.to_datetime(df['month'].astype(str))
        df['y'] = df['total']
        prophet_df = df[['ds', 'y']]
        
        # Initialize and train Prophet model
        self.model = Prophet(
            yearly_seasonality=True if stats['months_of_data'] >= 12 else False,
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
        
        # Get only future predictions
        future_predictions = forecast.tail(periods)
        next_month = future_predictions.iloc[0]
        
        # Ensure predictions are reasonable
        predicted_amount = max(float(next_month['yhat']), 0)
        min_amount = max(float(next_month['yhat_lower']), 0)
        max_amount = max(float(next_month['yhat_upper']), predicted_amount)
        
        # Fallback to average if unrealistic
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
        
        # Yearly prediction
        yearly_predictions = []
        for i in range(min(12, len(future_predictions))):
            pred_val = max(float(future_predictions.iloc[i]['yhat']), 0)
            if pred_val == 0 or pred_val > stats['average_monthly'] * 3:
                pred_val = stats['average_monthly']
            yearly_predictions.append(pred_val)
        
        yearly_total = sum(yearly_predictions)
        if len(yearly_predictions) < 12:
            yearly_total += stats['average_monthly'] * (12 - len(yearly_predictions))
        
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
        """Predict spending by category"""
        
        if not category_breakdown:
            return {}
        
        df = pd.DataFrame(category_breakdown).T
        category_percentages = {}
        
        for col in df.columns:
            avg_amount = df[col].mean()
            category_percentages[col] = avg_amount
        
        total = sum(category_percentages.values())
        
        predictions = {}
        for category, avg_amount in category_percentages.items():
            percentage = (avg_amount / total) if total > 0 else 0
            predicted_amount = next_month_total * percentage
            predictions[category] = round(predicted_amount, 2)
        
        return predictions
    
    def _generate_insights(self, stats, next_month_prediction):
        """Generate insights"""
        
        insights = []
        avg_monthly = stats['average_monthly']
        change = ((next_month_prediction - avg_monthly) / avg_monthly) * 100 if avg_monthly > 0 else 0
        
        if change > 5:
            insights.append(f" Spending expected to increase by {abs(change):.1f}% next month")
        elif change < -5:
            insights.append(f" Spending expected to decrease by {abs(change):.1f}% next month")
        else:
            insights.append(" Spending expected to remain stable next month")
        
        if stats['months_of_data'] >= 6:
            insights.append(f" High confidence - {stats['months_of_data']} months of data")
        elif stats['months_of_data'] >= 3:
            insights.append(f" Moderate confidence - {stats['months_of_data']} months of data")
        else:
            insights.append(" Add more data for better predictions")
        
        return insights
