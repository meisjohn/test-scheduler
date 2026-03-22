const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  weekIdentifier: { type: String, unique: true, required: true },
  testStrings: { 
    type: [String], 
    default: ["String One", "String Two", "String Three"] 
  },
  locations: { type: [String], default: ["Cloud", "Lab", "Field"] },
  companyHolidays: { type: [{ name: String, month: Number, day: Number }], default: [] },
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
  },
  isLocked: { type: Boolean, default: false },
  notes: { type: String, default: "" },
  externalDocUrl: { type: String, default: "" }
});

module.exports = mongoose.model('Config', ConfigSchema);