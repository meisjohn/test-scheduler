const mongoose = require('mongoose');

const GlobalConfigSchema = new mongoose.Schema({
  // We only ever need one document here
  testStrings: { type: [String], default: ["String Alpha", "String Beta"] },
  locations: { type: [String], default: ["Cloud", "Lab", "Field"] },
  shiftConfigs: { 
    type: [{ name: String, startTime: String, endTime: String }], 
    default: [
      { name: "Day Shift", startTime: "08:00", endTime: "16:00" },
      { name: "Night Shift", startTime: "16:00", endTime: "00:00" }
    ] 
  }
});

module.exports = mongoose.model('GlobalConfig', GlobalConfigSchema);