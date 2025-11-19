import mongoose from 'mongoose';
import os from 'os';

const { Schema } = mongoose;

const systemHealthSchema = new Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 2592000 // 30 days TTL
  },
  metrics: {
    database: {
      status: {
        type: String,
        enum: ['healthy', 'warning', 'error'],
        default: 'healthy'
      },
      connectionCount: {
        type: Number,
        default: 0
      },
      responseTime: {
        type: Number, // in milliseconds
        default: 0
      },
      lastError: {
        type: String,
        default: null
      },
      lastChecked: {
        type: Date,
        default: Date.now
      }
    },
    email: {
      status: {
        type: String,
        enum: ['healthy', 'warning', 'error'],
        default: 'healthy'
      },
      deliveryRate: {
        type: Number, // percentage
        default: 100
      },
      lastDelivery: {
        type: Date,
        default: null
      },
      lastError: {
        type: String,
        default: null
      },
      emailsSentToday: {
        type: Number,
        default: 0
      },
      lastChecked: {
        type: Date,
        default: Date.now
      }
    },
    api: {
      responseTime: {
        type: Number, // in milliseconds
        default: 0
      },
      errorRate: {
        type: Number, // percentage
        default: 0
      },
      requestCount: {
        type: Number,
        default: 0
      },
      activeConnections: {
        type: Number,
        default: 0
      },
      lastChecked: {
        type: Date,
        default: Date.now
      }
    },
    storage: {
      usedSpace: {
        type: Number, // in bytes
        default: 0
      },
      totalSpace: {
        type: Number, // in bytes
        default: 0
      },
      uploadCount: {
        type: Number,
        default: 0
      },
      status: {
        type: String,
        enum: ['healthy', 'warning', 'error'],
        default: 'healthy'
      },
      lastChecked: {
        type: Date,
        default: Date.now
      }
    },
    memory: {
      used: {
        type: Number, // in bytes
        default: 0
      },
      total: {
        type: Number, // in bytes
        default: 0
      },
      percentage: {
        type: Number,
        default: 0
      },
      status: {
        type: String,
        enum: ['healthy', 'warning', 'error'],
        default: 'healthy'
      }
    },
    cpu: {
      usage: {
        type: Number, // percentage
        default: 0
      },
      loadAverage: {
        type: Number,
        default: 0
      },
      status: {
        type: String,
        enum: ['healthy', 'warning', 'error'],
        default: 'healthy'
      }
    }
  },
  overallStatus: {
    type: String,
    enum: ['healthy', 'warning', 'error'],
    default: 'healthy'
  },
  alerts: [{
    type: {
      type: String,
      enum: ['database', 'email', 'api', 'storage', 'memory', 'cpu', 'system']
    },
    level: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical']
    },
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
systemHealthSchema.index({ timestamp: -1 });
systemHealthSchema.index({ overallStatus: 1 });
systemHealthSchema.index({ 'alerts.level': 1, 'alerts.resolved': 1 });

// Virtual for formatted timestamp
systemHealthSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toLocaleString('sq-AL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
});

// Virtual for storage usage percentage
systemHealthSchema.virtual('storageUsagePercentage').get(function() {
  if (this.metrics.storage.totalSpace === 0) return 0;
  return Math.round((this.metrics.storage.usedSpace / this.metrics.storage.totalSpace) * 100);
});

// Virtual for formatted storage sizes
systemHealthSchema.virtual('formattedStorage').get(function() {
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return {
    used: formatBytes(this.metrics.storage.usedSpace),
    total: formatBytes(this.metrics.storage.totalSpace),
    percentage: this.storageUsagePercentage
  };
});

// Virtual for active alerts count
systemHealthSchema.virtual('activeAlertsCount').get(function() {
  return this.alerts ? this.alerts.filter(alert => !alert.resolved).length : 0;
});

// Method to calculate overall status
systemHealthSchema.methods.calculateOverallStatus = function() {
  const statuses = [
    this.metrics.database.status,
    this.metrics.email.status,
    this.metrics.storage.status,
    this.metrics.memory.status,
    this.metrics.cpu.status
  ];

  if (statuses.includes('error')) {
    this.overallStatus = 'error';
  } else if (statuses.includes('warning')) {
    this.overallStatus = 'warning';
  } else {
    this.overallStatus = 'healthy';
  }

  return this.overallStatus;
};

// Method to add alert
systemHealthSchema.methods.addAlert = function(type, level, message) {
  this.alerts.push({
    type,
    level,
    message,
    timestamp: new Date(),
    resolved: false
  });

  // Keep only last 50 alerts
  if (this.alerts.length > 50) {
    this.alerts = this.alerts.slice(-50);
  }

  this.markModified('alerts');
  return this.save();
};

// Method to resolve alert
systemHealthSchema.methods.resolveAlert = function(alertId) {
  const alert = this.alerts.id(alertId);
  if (alert) {
    alert.resolved = true;
    this.markModified('alerts');
    return this.save();
  }
  return Promise.reject(new Error('Alert not found'));
};

// Static method to create health check
systemHealthSchema.statics.createHealthCheck = async function() {
  const healthData = new this();

  // Check database health
  try {
    const dbStart = Date.now();
    await mongoose.connection.db.admin().ping();
    const dbResponseTime = Date.now() - dbStart;

    healthData.metrics.database = {
      status: dbResponseTime > 1000 ? 'warning' : 'healthy',
      connectionCount: mongoose.connection.readyState,
      responseTime: dbResponseTime,
      lastError: null,
      lastChecked: new Date()
    };
  } catch (error) {
    healthData.metrics.database = {
      status: 'error',
      connectionCount: 0,
      responseTime: 0,
      lastError: error.message,
      lastChecked: new Date()
    };
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  const memPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;

  healthData.metrics.memory = {
    used: memUsage.heapUsed,
    total: memUsage.heapTotal,
    percentage: Math.round(memPercentage),
    status: memPercentage > 90 ? 'error' : memPercentage > 75 ? 'warning' : 'healthy'
  };

  // Check CPU usage (simplified)
  const cpuUsage = process.cpuUsage();
  const loadAverage = os.loadavg()[0];

  healthData.metrics.cpu = {
    usage: Math.round(loadAverage * 10), // Simplified CPU usage
    loadAverage: loadAverage,
    status: loadAverage > 2 ? 'error' : loadAverage > 1 ? 'warning' : 'healthy'
  };

  // Set email status (basic check)
  healthData.metrics.email = {
    status: 'healthy', // Will be updated by email service
    deliveryRate: 100,
    lastDelivery: null,
    lastError: null,
    emailsSentToday: 0,
    lastChecked: new Date()
  };

  // Set storage status (basic)
  healthData.metrics.storage = {
    usedSpace: 0, // Will be calculated by storage service
    totalSpace: 0,
    uploadCount: 0,
    status: 'healthy',
    lastChecked: new Date()
  };

  // Set API status
  healthData.metrics.api = {
    responseTime: 0, // Will be updated by API monitoring
    errorRate: 0,
    requestCount: 0,
    activeConnections: 0,
    lastChecked: new Date()
  };

  // Calculate overall status
  healthData.calculateOverallStatus();

  return healthData.save();
};

// Static method to get latest health status
systemHealthSchema.statics.getLatestHealth = function() {
  return this.findOne().sort({ timestamp: -1 });
};

// Static method to get health history
systemHealthSchema.statics.getHealthHistory = function(hours = 24) {
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - hours);

  return this.find({ timestamp: { $gte: startTime } })
    .sort({ timestamp: -1 })
    .limit(100);
};

// Static method to get health statistics
systemHealthSchema.statics.getHealthStats = function(days = 7) {
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - days);

  return this.aggregate([
    { $match: { timestamp: { $gte: startTime } } },
    {
      $group: {
        _id: '$overallStatus',
        count: { $sum: 1 },
        avgDatabaseResponseTime: { $avg: '$metrics.database.responseTime' },
        avgMemoryUsage: { $avg: '$metrics.memory.percentage' },
        avgCpuUsage: { $avg: '$metrics.cpu.usage' }
      }
    }
  ]);
};

// Static method to cleanup old health records
systemHealthSchema.statics.cleanupOldRecords = function(daysToKeep = 30) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - daysToKeep);

  return this.deleteMany({ timestamp: { $lt: dateThreshold } });
};

export default mongoose.model('SystemHealth', systemHealthSchema);