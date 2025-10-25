import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

class DataProcessor:
    """Processes expense data for ML predictions"""
    
    def __init__(self):
        self.categories = [
            'Food & Dining', 'Transportation', 'Shopping', 
            'Entertainment', 'Bills & Utilities', 'Healthcare', 'Others'
        ]
    
    def process_expenses(self, expenses_data):
        """
        Convert raw expense data to time series format
        
        Args:
            expenses_data: List of expense dictionaries from MongoDB
            
        Returns:
            dict: Processed data with monthly aggregations
        """
        if not expenses_data or len(expenses_data) == 0:
            return {
                'success': False,
                'error': 'No expense data provided',
                'months_of_data': 0
            }
        
        # Convert to DataFrame
        df = pd.DataFrame(expenses_data)
        
        # Convert date strings to datetime
        df['date'] = pd.to_datetime(df['date'])
        
        # Handle split expenses - only count user's share
        df['actual_amount'] = df.apply(
            lambda row: self._calculate_user_amount(row), axis=1
        )
        
        # Extract month-year
        df['month'] = df['date'].dt.to_period('M')
        
        # Overall monthly totals
        monthly_totals = df.groupby('month')['actual_amount'].sum().reset_index()
        monthly_totals.columns = ['month', 'total']
        monthly_totals['month'] = monthly_totals['month'].astype(str)
        
        # Category-wise monthly breakdown
        category_breakdown = df.groupby(['month', 'category'])['actual_amount'].sum().reset_index()
        
        # Pivot to get categories as columns
        category_pivot = category_breakdown.pivot(
            index='month', 
            columns='category', 
            values='actual_amount'
        ).fillna(0)
        
        # Calculate statistics
        stats = {
            'total_expenses': len(df),
            'months_of_data': len(monthly_totals),
            'date_range': {
                'start': df['date'].min().strftime('%Y-%m-%d'),
                'end': df['date'].max().strftime('%Y-%m-%d')
            },
            'average_monthly': float(monthly_totals['total'].mean()),
            'total_spending': float(df['actual_amount'].sum())
        }
        
        return {
            'success': True,
            'monthly_totals': monthly_totals.to_dict('records'),
            'category_breakdown': category_pivot.to_dict('index'),
            'stats': stats,
            'raw_df': df  # Keep for model training
        }
    
    def _calculate_user_amount(self, row):
        """Calculate actual amount for user (handles splits)"""
        if pd.isna(row.get('user_share')) or row.get('user_share') == 0:
            # Regular personal expense
            return float(row['amount'])
        else:
            # Split expense - only count user's share
            return float(row.get('user_share', row['amount']))
    
    def prepare_for_prophet(self, monthly_data):
        """
        Prepare data in Prophet's required format (ds, y)
        
        Args:
            monthly_data: List of monthly totals
            
        Returns:
            DataFrame: Prophet-ready data
        """
        df = pd.DataFrame(monthly_data)
        df['ds'] = pd.to_datetime(df['month'].astype(str))
        df['y'] = df['total']
        return df[['ds', 'y']]
