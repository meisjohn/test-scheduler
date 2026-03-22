const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const Config = require('../models/Config');
const GlobalConfig = require('../models/GlobalConfig');

// 1. GET everything for a specific week (Activities + Config)
router.get('/:week', async (req, res) => {
  try {
    const weekId = req.params.week;
    const activities = await Activity.find({ $or: [{ weekIdentifier: weekId }, { status: 'staged' }] });
    let config = await Config.findOne({ weekIdentifier: weekId });
    
    if (!config) {
      // Look for Global Template first
      let global = await GlobalConfig.findOne();
      if (!global) {
        global = await GlobalConfig.create({}); // Create first-time defaults
      }
      // Create week config BASED ON Global Template
      config = await Config.create({ 
        weekIdentifier: weekId,
        testStrings: global.testStrings,
        locations: global.locations,
        shiftConfigs: global.shiftConfigs,
        companyHolidays: global.companyHolidays,
        hideWeekends: global.hideWeekends
      });
    }
    res.json({ activities, config });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. CREATE a new staged objective (Supports both Backlog and Direct-to-Grid)
router.post('/', async (req, res) => {
  try {
    const activity = new Activity({
      title: req.body.title,
      status: req.body.status || 'staged', // Respect 'scheduled' if sent
      weekIdentifier: req.body.weekIdentifier,
      testString: req.body.testString,
      shift: req.body.shift,
      order: req.body.order,
      location: req.body.location || 'unassigned',
      lead: req.body.lead || '',
      testPlan: req.body.testPlan || '',
      docUrl: req.body.docUrl || ''
    });

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

// Delete a week's configuration
router.delete('/config/:week', async (req, res) => {
  try {
    const weekId = req.params.week;
    await Config.findOneAndDelete({ weekIdentifier: weekId });
    // Optional: Unstage all activities for this week so they aren't "lost"
    await Activity.updateMany(
      { weekIdentifier: weekId },
      { status: 'staged', weekIdentifier: null, testString: null, shift: null, order: null }
    );
    res.json({ message: "Week configuration reset and activities unstaged" });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

router.put('/global/config', async (req, res) => {
  try {
    // Destructure companyHolidays from the request body
    const { testStrings, locations, shiftConfigs, companyHolidays, hideWeekends } = req.body;
    const updated = await GlobalConfig.findOneAndUpdate(
      {}, 
      { testStrings, locations, shiftConfigs, companyHolidays, hideWeekends }, 
      { upsert: true, new: true }
    );
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// MASTER EXPORT: Download everything as one JSON
router.get('/system/export', async (req, res) => {
  try {
    const activities = await Activity.find({});
    const configs = await Config.find({});
    const global = await GlobalConfig.findOne({});
    
    res.json({
      timestamp: new Date().toISOString(),
      version: "1.2",
      data: { activities, configs, global }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MASTER IMPORT: Warning - This wipes the current DB!
router.post('/system/import', async (req, res) => {
  try {
    const { activities, configs, global } = req.body.data;

    // 1. Wipe current collections
    await Activity.deleteMany({});
    await Config.deleteMany({});
    await GlobalConfig.deleteMany({});

    // 2. Insert migrated data
    if (activities?.length) await Activity.insertMany(activities);
    if (configs?.length) await Config.insertMany(configs);
    if (global) await GlobalConfig.create(global);

    res.json({ message: "System Restore Successful" });
  } catch (err) {
    res.status(500).json({ error: "Import Failed: " + err.message });
  }
});

// ARCHIVE & PRUNE: Download and delete old records
router.post('/system/archive', async (req, res) => {
  try {
    const { olderThanWeeks } = req.body;
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(now.getDate() - (olderThanWeeks * 7));

    // Find all activities created before the cutoff that are NOT in the backlog
    // We keep 'staged' items because they are global.
    const query = {
      createdAt: { $lt: cutoffDate },
      status: 'scheduled'
    };

    const activitiesToArchive = await Activity.find(query);
    
    if (activitiesToArchive.length === 0) {
      return res.status(404).json({ message: "No records found older than specified limit." });
    }

    // Get the unique week identifiers being deleted to archive their configs too
    const weekIds = [...new Set(activitiesToArchive.map(a => a.weekIdentifier))];
    const configsToArchive = await Config.find({ weekIdentifier: { $in: weekIds } });

    // Perform the deletion after fetching data for the response
    await Activity.deleteMany(query);
    // Optional: Delete configs for those weeks if they are no longer needed
    // await Config.deleteMany({ weekIdentifier: { $in: weekIds } });

    res.json({
      archiveDate: new Date().toISOString(),
      prunedCount: activitiesToArchive.length,
      data: {
        activities: activitiesToArchive,
        configs: configsToArchive
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESTORE ARCHIVE: Merges archived data into the current DB
router.post('/system/restore-archive', async (req, res) => {
  try {
    const { activities, configs } = req.body.data;
    let restoredActivities = 0;
    let restoredConfigs = 0;

    // 1. Restore Configs (Upsert: Update if exists, Create if not)
    if (configs && configs.length > 0) {
      for (const conf of configs) {
        await Config.findOneAndUpdate(
          { weekIdentifier: conf.weekIdentifier },
          conf,
          { upsert: true }
        );
        restoredConfigs++;
      }
    }

    // 2. Restore Activities (Only if they don't already exist)
    if (activities && activities.length > 0) {
      for (const act of activities) {
        const exists = await Activity.findById(act._id);
        if (!exists) {
          await Activity.create(act);
          restoredActivities++;
        }
      }
    }

    res.json({ 
      message: "Restore Complete", 
      activitiesRestored: restoredActivities,
      configsRestored: restoredConfigs 
    });
  } catch (err) {
    res.status(500).json({ error: "Restore Failed: " + err.message });
  }
});

module.exports = router;