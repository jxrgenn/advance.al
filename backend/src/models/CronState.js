/**
 * Persisted state of each scheduled background job (services/scheduler.js).
 *
 * One document per job name. `nextRunAt` survives restarts, so a daily job
 * runs once a day even when the process restarts more often than that (#63:
 * with in-memory setInterval only, a daily worker on a dyno that restarts
 * every few hours never fired). `lockedUntil` makes a run exclusive across
 * processes (two instances during a deploy overlap) and expires on its own if
 * the process dies mid-run.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const cronStateSchema = new Schema({
  _id: { type: String }, // job name
  nextRunAt: { type: Date, default: null },
  lockedUntil: { type: Date, default: null },
  lockedBy: { type: String, default: null },
  lastStartedAt: { type: Date, default: null },
  lastFinishedAt: { type: Date, default: null },
  lastSuccessAt: { type: Date, default: null },
  lastDurationMs: { type: Number, default: null },
  lastError: { type: String, default: null },
  runs: { type: Number, default: 0 },
  failures: { type: Number, default: 0 },
}, { versionKey: false, collection: 'cronstates' });

export default mongoose.models.CronState || mongoose.model('CronState', cronStateSchema);
