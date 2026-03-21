const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const Config = require('../models/Config');

// 1. GET everything for a specific week (Activities + Config)
router.get('/:week', async (req, res) => {
  try {
    const weekId = req.params.week;
    const activities = await Activity.find({ weekIdentifier: weekId });
    let config = await Config.findOne({ weekIdentifier: weekId });
    
    // Default data structure
    const defaultShifts = [
      { name: "Day Shift", startTime: "08:00", endTime: "16:00" },
      { name: "Night Shift", startTime: "16:00", endTime: "00:00" }
    ];
    const defaultStrings = ["String Alpha", "String Beta", "String Gamma"];

    if (!config) {
      console.log(`[Backend] Creating new config for ${weekId}`);
      config = await Config.create({ 
        weekIdentifier: weekId,
        testStrings: defaultStrings,
        shiftConfigs: defaultShifts
      });
    } else {
      // SELF-HEAL: If config exists but strings or shifts are empty
      let needsSaving = false;
      if (!config.testStrings || config.testStrings.length === 0) {
        config.testStrings = defaultStrings;
        needsSaving = true;
      }
      if (!config.shiftConfigs || config.shiftConfigs.length === 0) {
        config.shiftConfigs = defaultShifts;
        needsSaving = true;
      }
      if (needsSaving) {
        console.log(`[Backend] Repairing existing config for ${weekId}`);
        await config.save();
      }
    }
    
    res.json({ activities, config });
  } catch (err) {
    console.error("[Backend Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. CREATE a new staged objective
router.post('/', async (req, res) => {
  const activity = new Activity({
    title: req.body.title,
    objective: req.body.objective,
    weekIdentifier: req.body.weekIdentifier,
    status: 'staged'
  });
  try {
    const newActivity = await activity.save();
    res.status(201).json(newActivity);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// 3. UPDATE an activity (Move it to a shift, change Lead, or update Test Plan)
router.patch('/:id', async (req, res) => {
  try {
    const updatedActivity = await Activity.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true } // returns the updated document
    );
    res.json(updatedActivity);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// 4. DELETE an activity
router.delete('/:id', async (req, res) => {
  try {
    await Activity.findByIdAndDelete(req.params.id);
    res.json({ message: "Activity deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;