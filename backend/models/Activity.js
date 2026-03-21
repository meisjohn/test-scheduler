const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  objective: { type: String },
  lead: { type: String }, // Responsible Individual
  location: { 
    type: String, 
    enum: ['cloud', 'lab', 'field', 'unassigned'], 
    default: 'unassigned' 
  },
  testString: { type: String }, // e.g., "String Alpha"
  shift: { type: Number, enum: [1, 2, null], default: null }, // 1 or 2
  weekIdentifier: { type: String, required: true }, // e.g., "2024-W12"
  status: { 
    type: String, 
    enum: ['staged', 'scheduled'], 
    default: 'staged' 
  },
  testPlan: { type: String, default: "" }, // Detailed Markdown content
  order: { type: Number, default: 0 } // For sorting in the staging list
}, { timestamps: true });

module.exports = mongoose.model('Activity', ActivitySchema);