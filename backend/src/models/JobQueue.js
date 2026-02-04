import mongoose from 'mongoose';

const { Schema } = mongoose;

const jobQueueSchema = new Schema({
  jobId: {
    type: Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },

  taskType: {
    type: String,
    enum: ['generate_embedding', 'compute_similarity'],
    required: true
  },

  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    required: true
  },

  priority: {
    type: Number,
    default: 10,
    min: 1,
    max: 10
  },

  attempts: {
    type: Number,
    default: 0
  },

  maxAttempts: {
    type: Number,
    default: 3
  },

  error: {
    type: String
  },

  nextRetryAt: {
    type: Date
  },

  processingBy: {
    type: Number // process.pid
  },

  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for efficient queue operations
jobQueueSchema.index({ status: 1, priority: 1, createdAt: 1 }); // Worker polling
jobQueueSchema.index({ jobId: 1, taskType: 1 }); // Check if job already queued
jobQueueSchema.index({ nextRetryAt: 1 }, { sparse: true }); // Retry scheduling
jobQueueSchema.index({ processingBy: 1 }, { sparse: true }); // Track which worker is processing

// Unique compound index to prevent duplicate pending/processing tasks
jobQueueSchema.index(
  { jobId: 1, taskType: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['pending', 'processing'] }
    }
  }
);

// TTL index - auto-delete completed/failed items after 7 days
jobQueueSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60, // 7 days
    partialFilterExpression: {
      status: { $in: ['completed', 'failed'] }
    }
  }
);

// Static method: Get next pending task
jobQueueSchema.statics.getNextTask = async function() {
  return await this.findOneAndUpdate(
    {
      $or: [
        { status: 'pending' },
        {
          status: 'failed',
          nextRetryAt: { $lte: new Date() },
          attempts: { $lt: mongoose.model('JobQueue').schema.path('maxAttempts').defaultValue }
        }
      ]
    },
    {
      $set: {
        status: 'processing',
        processingBy: process.pid
      },
      $inc: { attempts: 1 }
    },
    {
      sort: { priority: 1, createdAt: 1 }, // Lower priority number = higher priority
      new: true
    }
  );
};

// Static method: Mark task as completed
jobQueueSchema.statics.completeTask = async function(queueId) {
  return await this.findByIdAndUpdate(
    queueId,
    {
      $set: {
        status: 'completed',
        processingBy: null
      }
    },
    { new: true }
  );
};

// Static method: Mark task as failed with retry
jobQueueSchema.statics.failTask = async function(queueId, error) {
  const task = await this.findById(queueId);

  if (!task) {
    throw new Error(`Task ${queueId} not found`);
  }

  // Calculate next retry time with exponential backoff
  const retryDelays = (process.env.QUEUE_RETRY_DELAYS || '60000,300000,900000')
    .split(',')
    .map(d => parseInt(d));

  const retryDelay = retryDelays[Math.min(task.attempts - 1, retryDelays.length - 1)];
  const nextRetryAt = new Date(Date.now() + retryDelay);

  // If max attempts reached, mark as failed permanently
  const status = task.attempts >= task.maxAttempts ? 'failed' : 'failed';

  return await this.findByIdAndUpdate(
    queueId,
    {
      $set: {
        status,
        error: error?.message || String(error),
        nextRetryAt: task.attempts < task.maxAttempts ? nextRetryAt : null,
        processingBy: null
      }
    },
    { new: true }
  );
};

// Static method: Recover stuck jobs (processing for too long)
jobQueueSchema.statics.recoverStuck = async function() {
  const stuckTimeout = parseInt(process.env.QUEUE_STUCK_TIMEOUT || '600000'); // 10 minutes
  const stuckThreshold = new Date(Date.now() - stuckTimeout);

  const result = await this.updateMany(
    {
      status: 'processing',
      updatedAt: { $lt: stuckThreshold }
    },
    {
      $set: {
        status: 'pending',
        processingBy: null
      }
    }
  );

  return result.modifiedCount;
};

// Static method: Get queue stats
jobQueueSchema.statics.getStats = async function() {
  const [stats] = await this.aggregate([
    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ],
        byTaskType: [
          {
            $group: {
              _id: '$taskType',
              count: { $sum: 1 }
            }
          }
        ],
        total: [
          {
            $count: 'count'
          }
        ]
      }
    }
  ]);

  return {
    byStatus: stats.byStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    byTaskType: stats.byTaskType.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    total: stats.total[0]?.count || 0
  };
};

// Instance method: Can retry?
jobQueueSchema.methods.canRetry = function() {
  return this.attempts < this.maxAttempts;
};

export default mongoose.model('JobQueue', jobQueueSchema);
