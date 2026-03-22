const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const Config = require('../models/Config');

// 1. GET everything for a specific week (Activities + Config)
router.get('/:week', async (req, res) => {
  try {
    const weekId = req.params.week;
    
    // Get Activities (Global Backlog + Current Week)
    const activities = await Activity.find({
      $or: [
        { weekIdentifier: weekId },
        { status: 'staged' }
      ]
    });

    let config = await Config.findOne({ weekIdentifier: weekId });
    
    if (!config) {
      // Create new with all defaults from the model
      config = await Config.create({ weekIdentifier: weekId });
    } else {
      // REPAIR: If an old config exists but is missing new fields
      let needsSaving = false;
      if (config.isLocked === undefined) { config.isLocked = false; needsSaving = true; }
      if (config.notes === undefined) { config.notes = ""; needsSaving = true; }
      if (config.externalDocUrl === undefined) { config.externalDocUrl = ""; needsSaving = true; }
      
      if (needsSaving) await config.save();
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
    status: 'staged',
    // We explicitly DON'T set weekIdentifier here so it's global
    location: 'unassigned',
    lead: '',
    testPlan: ''
  });
  
  try {
    const newActivity = await activity.save();
    res.status(201).json(newActivity);
  } catch (err) {
    console.error("[Backend POST Error]", err);
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

// UPDATE Week Configuration (Strings/Shifts)
router.put('/config/:week', async (req, res) => {
  try {
    const weekId = req.params.week;
    const { testStrings, shiftConfigs, isLocked, notes, externalDocUrl, locations } = req.body;
    
    const oldConfig = await Config.findOne({ weekIdentifier: weekId });
    
    if (oldConfig && testStrings) {
      // 1. Handle String Renames (Indices must match)
      for (let i = 0; i < testStrings.length; i++) {
        const oldName = oldConfig.testStrings[i];
        const newName = testStrings[i];
        
        if (oldName && newName && oldName !== newName) {
          await Activity.updateMany(
            { weekIdentifier: weekId, testString: oldName },
            { testString: newName }
          );
        }
      }

      // 2. Handle String Deletions (Unstage items that lost their row)
      if (testStrings.length < oldConfig.testStrings.length) {
        const keptStrings = testStrings;
        await Activity.updateMany(
          { weekIdentifier: weekId, testString: { $nin: keptStrings }, status: 'scheduled' },
          { status: 'staged', testString: null, shift: null, order: null, weekIdentifier: null }
        );
      }
    }

    const updated = await Config.findOneAndUpdate(
      { weekIdentifier: weekId },
      req.body, // Save everything: locations, notes, isLocked, etc.
      { new: true, upsert: true }
    );
    
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;