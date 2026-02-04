import mongoose from 'mongoose';
import os from 'os';

const { Schema } = mongoose;

const workerStatusSchema = new Schema({
  workerId: {
    type: Number, // process.pid
    required: true,
    unique: true
  },

  hostname: {
    type: String,
    default: () => os.hostname()
  },

  status: {
    type: String,
    enum: ['starting', 'running', 'paused', 'stopping', 'stopped'],
    default: 'starting',
    required: true
  },

  lastHeartbeat: {
    type: Date,
    default: Date.now,
    required: true
  },

  processedCount: {
    type: Number,
    default: 0
  },

  failedCount: {
    type: Number,
    default: 0
  },

  memoryUsage: {
    heapUsed: Number, // MB
    heapTotal: Number, // MB
    percentUsed: Number // 0-100
  },

  currentTask: {
    queueId: {
      type: Schema.Types.ObjectId,
      ref: 'JobQueue'
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job'
    },
    taskType: String,
    startedAt: Date
  },

  startedAt: {
    type: Date,
    default: Date.now
  },

  config: {
    maxConcurrent: Number,
    workerInterval: Number,
    batchSize: Number
  }
}, {
  timestamps: true
});

// Indexes
workerStatusSchema.index({ workerId: 1 }, { unique: true });
workerStatusSchema.index({ lastHeartbeat: -1 }); // For health checks
workerStatusSchema.index({ status: 1 });

// TTL index - auto-delete stopped workers after 1 hour
workerStatusSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 3600, // 1 hour
    partialFilterExpression: {
      status: 'stopped'
    }
  }
);

// Static method: Register or update worker
workerStatusSchema.statics.register = async function(workerId, config = {}) {
  const memUsage = process.memoryUsage();

  return await this.findOneAndUpdate(
    { workerId },
    {
      $set: {
        status: 'running',
        lastHeartbeat: new Date(),
        hostname: os.hostname(),
        config: {
          maxConcurrent: config.maxConcurrent || parseInt(process.env.EMBEDDING_MAX_CONCURRENT || '3'),
          workerInterval: config.workerInterval || parseInt(process.env.EMBEDDING_WORKER_INTERVAL || '5000'),
          batchSize: config.batchSize || parseInt(process.env.EMBEDDING_BATCH_SIZE || '500')
        },
        memoryUsage: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          percentUsed: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        }
      },
      $setOnInsert: {
        workerId,
        startedAt: new Date(),
        processedCount: 0,
        failedCount: 0
      }
    },
    {
      upsert: true,
      new: true
    }
  );
};

// Static method: Update heartbeat
workerStatusSchema.statics.heartbeat = async function(workerId) {
  const memUsage = process.memoryUsage();

  return await this.findOneAndUpdate(
    { workerId },
    {
      $set: {
        lastHeartbeat: new Date(),
        memoryUsage: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          percentUsed: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        }
      }
    },
    { new: true }
  );
};

// Static method: Set current task
workerStatusSchema.statics.setCurrentTask = async function(workerId, task) {
  return await this.findOneAndUpdate(
    { workerId },
    {
      $set: {
        currentTask: task ? {
          queueId: task._id,
          jobId: task.jobId,
          taskType: task.taskType,
          startedAt: new Date()
        } : null
      }
    },
    { new: true }
  );
};

// Static method: Increment processed count
workerStatusSchema.statics.incrementProcessed = async function(workerId) {
  return await this.findOneAndUpdate(
    { workerId },
    {
      $inc: { processedCount: 1 },
      $set: { currentTask: null }
    },
    { new: true }
  );
};

// Static method: Increment failed count
workerStatusSchema.statics.incrementFailed = async function(workerId) {
  return await this.findOneAndUpdate(
    { workerId },
    {
      $inc: { failedCount: 1 },
      $set: { currentTask: null }
    },
    { new: true }
  );
};

// Static method: Update status
workerStatusSchema.statics.updateStatus = async function(workerId, status) {
  return await this.findOneAndUpdate(
    { workerId },
    {
      $set: { status }
    },
    { new: true }
  );
};

// Static method: Get all active workers
workerStatusSchema.statics.getActiveWorkers = async function() {
  const deadThreshold = parseInt(process.env.WORKER_DEAD_THRESHOLD || '180000'); // 3 minutes
  const aliveThreshold = new Date(Date.now() - deadThreshold);

  return await this.find({
    lastHeartbeat: { $gte: aliveThreshold },
    status: { $in: ['starting', 'running', 'paused'] }
  }).sort({ lastHeartbeat: -1 });
};

// Static method: Get all workers (including dead ones)
workerStatusSchema.statics.getAllWorkers = async function() {
  const deadThreshold = parseInt(process.env.WORKER_DEAD_THRESHOLD || '180000'); // 3 minutes
  const aliveThreshold = new Date(Date.now() - deadThreshold);

  const workers = await this.find({}).sort({ lastHeartbeat: -1 });

  return workers.map(worker => {
    const isAlive = worker.lastHeartbeat >= aliveThreshold &&
                   ['starting', 'running', 'paused'].includes(worker.status);

    return {
      ...worker.toObject(),
      isAlive,
      timeSinceHeartbeat: Date.now() - worker.lastHeartbeat.getTime()
    };
  });
};

// Static method: Clean up stopped workers
workerStatusSchema.statics.cleanup = async function() {
  return await this.deleteMany({
    status: 'stopped',
    updatedAt: { $lt: new Date(Date.now() - 3600000) } // 1 hour ago
  });
};

// Instance method: Is worker alive?
workerStatusSchema.methods.isAlive = function() {
  const deadThreshold = parseInt(process.env.WORKER_DEAD_THRESHOLD || '180000'); // 3 minutes
  const aliveThreshold = new Date(Date.now() - deadThreshold);

  return this.lastHeartbeat >= aliveThreshold &&
         ['starting', 'running', 'paused'].includes(this.status);
};

// Instance method: Get uptime in seconds
workerStatusSchema.methods.getUptime = function() {
  return Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
};

export default mongoose.model('WorkerStatus', workerStatusSchema);
