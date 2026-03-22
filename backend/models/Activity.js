const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  lead: { type: String, default: "" },
  location: { type: String, default: "unassigned" },
  testPlan: { type: String, default: "" },
  docUrl: { type: String, default: "" },
  status: { type: String, enum: ['staged', 'scheduled'], default: 'staged' },
  
  // REMOVE 'required: true' from here:
  weekIdentifier: { type: String }, 
  
  testString: { type: String },
  shift: { type: Number },
  order: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('Activity', ActivitySchema);