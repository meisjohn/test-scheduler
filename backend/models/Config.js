const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  weekIdentifier: { type: String, unique: true, required: true },
  
  // Default Test Strings
  testStrings: { 
    type: [String], 
    default: ["String Alpha", "String Beta", "String Gamma"] 
  },
  
  // Default Shift Settings
  shiftConfigs: {
    type: [{
      name: String,
      startTime: String,
      endTime: String
    }],
    default: [
      { name: "Day Shift", startTime: "08:00", endTime: "16:00" },
      { name: "Night Shift", startTime: "16:00", endTime: "00:00" }
    ]
  }
});

module.exports = mongoose.model('Config', ConfigSchema);