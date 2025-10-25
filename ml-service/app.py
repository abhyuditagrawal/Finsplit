from flask import Flask, request, jsonify
from flask_cors import CORS
from models.data_processor import DataProcessor
from models.predictor import ExpensePredictor
import logging

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for Node.js requests

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize ML components
data_processor = DataProcessor()
predictor = ExpensePredictor()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'FinSplit ML Service',
        'version': '1.0.0'
    })

@app.route('/predict', methods=['POST'])
def predict_expenses():
    """
    Main prediction endpoint
    
    Expected JSON body:
    {
        "user_id": "123",
        "expenses": [
            {"amount": 2500, "category": "Food & Dining", "date": "2025-08-15", "user_share": 0},
            ...
        ],
        "periods": 12  // Optional, default 12 months
    }
    """
    try:
        data = request.get_json()
        
        # Validate input
        if not data or 'expenses' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing expenses data'
            }), 400
        
        expenses = data['expenses']
        periods = data.get('periods', 12)
        
        logger.info(f"Received {len(expenses)} expenses for prediction")
        
        # Process data
        processed_data = data_processor.process_expenses(expenses)
        
        if not processed_data['success']:
            return jsonify(processed_data), 400
        
        # Generate predictions
        predictions = predictor.train_and_predict(processed_data, periods)
        
        if not predictions['success']:
            return jsonify(predictions), 400
        
        logger.info("Predictions generated successfully")
        
        return jsonify(predictions), 200
        
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    print("🚀 Starting FinSplit ML Service...")
    print("📊 Prediction API ready at http://localhost:5001")
    app.run(host='0.0.0.0', port=5001, debug=True)
