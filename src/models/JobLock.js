const mongoose = require('mongoose');

const JobLockSchema = new mongoose.Schema(
  {
    job: { type: String, required: true },
    groupIndex: { type: Number, required: true },
    dayKey: { type: String, required: true },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

JobLockSchema.index({ job: 1, dayKey: 1, groupIndex: 1 }, { unique: true });

module.exports = mongoose.model('JobLock', JobLockSchema);

