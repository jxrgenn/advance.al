/**
 * Comprehensive Form Validation Utility
 *
 * Provides validation rules and error message generation for all forms across the platform.
 * Usage: Import validation functions and call them in form submit handlers.
 */

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean;
  message?: string;
}

export interface ValidationRules {
  [fieldName: string]: ValidationRule;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  errorMessage: string; // Human-readable summary
}

/**
 * Validate a single field value against a rule
 */
export const validateField = (
  fieldName: string,
  value: any,
  rule: ValidationRule
): ValidationError | null => {
  // Required check
  if (rule.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    return {
      field: fieldName,
      message: rule.message || `${fieldName} është i detyrueshëm`,
      value
    };
  }

  // Skip other validations if field is empty and not required
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }

  // Min length check
  if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
    return {
      field: fieldName,
      message: rule.message || `${fieldName} duhet të ketë të paktën ${rule.minLength} karaktere`,
      value
    };
  }

  // Max length check
  if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
    return {
      field: fieldName,
      message: rule.message || `${fieldName} nuk mund të kalojë ${rule.maxLength} karaktere`,
      value
    };
  }

  // Pattern check
  if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
    return {
      field: fieldName,
      message: rule.message || `${fieldName} ka format të pavlefshëm`,
      value
    };
  }

  // Custom validation
  if (rule.custom && !rule.custom(value)) {
    return {
      field: fieldName,
      message: rule.message || `${fieldName} nuk është i vlefshëm`,
      value
    };
  }

  return null;
};

/**
 * Validate an entire form object against validation rules
 */
export const validateForm = (
  formData: { [key: string]: any },
  rules: ValidationRules
): ValidationResult => {
  const errors: ValidationError[] = [];

  Object.entries(rules).forEach(([fieldName, rule]) => {
    const value = formData[fieldName];
    const error = validateField(fieldName, value, rule);
    if (error) {
      errors.push(error);
    }
  });

  // Generate human-readable error message
  let errorMessage = '';
  if (errors.length > 0) {
    if (errors.length === 1) {
      errorMessage = errors[0].message;
    } else {
      const fieldNames = errors.map(e => e.field).join(', ');
      errorMessage = `Ju lutemi kontrolloni këto fusha: ${fieldNames}`;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    errorMessage
  };
};

/**
 * Common validation rules for Profile forms
 */
export const profileValidationRules = {
  personal: {
    firstName: {
      required: true,
      minLength: 2,
      maxLength: 50,
      message: "Emri duhet të jetë midis 2 dhe 50 karakteresh"
    },
    lastName: {
      required: true,
      minLength: 2,
      maxLength: 50,
      message: "Mbiemri duhet të jetë midis 2 dhe 50 karakteresh"
    },
    phone: {
      required: true,
      pattern: /^\+?[0-9]{9,15}$/,
      message: "Numri i telefonit duhet të jetë i vlefshëm (9-15 shifra)"
    },
    bio: {
      maxLength: 500,
      message: "Biografia nuk mund të kalojë 500 karaktere"
    },
    city: {
      required: false,
      minLength: 2,
      maxLength: 50,
      message: "Qyteti duhet të jetë midis 2 dhe 50 karakteresh"
    }
  },
  professional: {
    headline: {
      maxLength: 100,
      message: "Titulli profesional nuk mund të kalojë 100 karaktere"
    },
    currentPosition: {
      maxLength: 100,
      message: "Pozicioni aktual nuk mund të kalojë 100 karaktere"
    },
    currentCompany: {
      maxLength: 100,
      message: "Kompania aktuale nuk mund të kalojë 100 karaktere"
    },
    skills: {
      custom: (value: string[]) => value && value.length <= 20,
      message: "Nuk mund të shtoni më shumë se 20 aftësi"
    },
    experience: {
      custom: (value: string) => !value || ['entry', 'mid', 'senior', 'lead'].includes(value),
      message: "Përvoja duhet të jetë një nga opsionet e vlefshme"
    }
  },
  workExperience: {
    position: {
      required: true,
      minLength: 2,
      maxLength: 100,
      message: "Pozicioni duhet të jetë midis 2 dhe 100 karakteresh"
    },
    company: {
      required: true,
      minLength: 2,
      maxLength: 100,
      message: "Kompania duhet të jetë midis 2 dhe 100 karakteresh"
    },
    location: {
      required: false,
      maxLength: 100,
      message: "Vendndodhja nuk mund të kalojë 100 karaktere"
    },
    startDate: {
      required: true,
      message: "Data e fillimit është e detyrueshme"
    },
    endDate: {
      required: false,
      message: "Data e mbarimit është e detyrueshme"
    },
    description: {
      required: false,
      maxLength: 500,
      message: "Përshkrimi nuk mund të kalojë 500 karaktere"
    },
    achievements: {
      required: false,
      maxLength: 300,
      message: "Arritjet nuk mund të kalojnë 300 karaktere"
    }
  },
  education: {
    degree: {
      required: true,
      message: "Diploma/Grada është e detyrueshme"
    },
    fieldOfStudy: {
      required: true,
      minLength: 2,
      maxLength: 100,
      message: "Fusha e studimit duhet të jetë midis 2 dhe 100 karakteresh"
    },
    institution: {
      required: true,
      minLength: 2,
      maxLength: 150,
      message: "Institucioni duhet të jetë midis 2 dhe 150 karakteresh"
    },
    location: {
      required: false,
      maxLength: 100,
      message: "Vendndodhja nuk mund të kalojë 100 karaktere"
    },
    startDate: {
      required: true,
      message: "Data e fillimit është e detyrueshme"
    },
    endDate: {
      required: false,
      message: "Data e mbarimit është e detyrueshme"
    },
    description: {
      required: false,
      maxLength: 500,
      message: "Përshkrimi nuk mund të kalojë 500 karaktere"
    }
  },
  settings: {
    email: {
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: "Email-i duhet të jetë i vlefshëm"
    },
    currentPassword: {
      minLength: 8,
      message: "Fjalëkalimi aktual duhet të ketë të paktën 8 karaktere"
    },
    newPassword: {
      minLength: 8,
      message: "Fjalëkalimi i ri duhet të ketë të paktën 8 karaktere"
    },
    confirmPassword: {
      custom: (value: string, formData?: any) =>
        !formData?.newPassword || value === formData.newPassword,
      message: "Fjalëkalimet nuk përputhen"
    }
  }
};

/**
 * Common validation rules for JobSeeker signup
 */
export const jobSeekerSignupRules = {
  fullForm: {
    firstName: profileValidationRules.personal.firstName,
    lastName: profileValidationRules.personal.lastName,
    email: profileValidationRules.settings.email,
    password: {
      required: true,
      minLength: 8,
      message: "Fjalëkalimi duhet të ketë të paktën 8 karaktere"
    },
    confirmPassword: {
      required: true,
      message: "Fjalëkalimet nuk përputhen"
    },
    phone: profileValidationRules.personal.phone,
    city: {
      required: true,
      message: "Qyteti është i detyrueshëm"
    },
    education: {
      required: true,
      message: "Arsimi është i detyrueshëm"
    }
  },
  quickForm: {
    firstName: profileValidationRules.personal.firstName,
    lastName: profileValidationRules.personal.lastName,
    email: profileValidationRules.settings.email,
    phone: {
      required: false,
      custom: (value: string) => {
        if (!value || value.trim() === '') return true; // Optional field
        const cleaned = value.replace(/[\s\-\(\)]/g, ''); // Remove spaces, dashes, parentheses
        return /^\+?[0-9]{9,15}$/.test(cleaned);
      },
      message: "Numri i telefonit duhet të jetë i vlefshëm (9-15 shifra)"
    }
  }
};

/**
 * Common validation rules for Employer signup
 */
export const employerSignupRules = {
  step0: {
    companyName: {
      required: true,
      minLength: 2,
      maxLength: 100,
      message: "Emri i kompanisë duhet të jetë midis 2 dhe 100 karakteresh"
    },
    email: profileValidationRules.settings.email,
    password: {
      required: true,
      minLength: 8,
      message: "Fjalëkalimi duhet të ketë të paktën 8 karaktere"
    },
    confirmPassword: {
      required: true,
      message: "Fjalëkalimet nuk përputhen"
    }
  },
  step1: {
    firstName: profileValidationRules.personal.firstName,
    lastName: profileValidationRules.personal.lastName,
    phone: profileValidationRules.personal.phone
  },
  step2: {
    companySize: {
      required: true,
      message: "Madhësia e kompanisë është e detyrueshme"
    },
    city: {
      required: true,
      message: "Qyteti është i detyrueshëm"
    },
    description: {
      required: false,
      minLength: 50,
      maxLength: 500,
      message: "Përshkrimi duhet të jetë midis 50 dhe 500 karakteresh"
    },
    website: {
      pattern: /^https?:\/\/.+\..+/,
      message: "Uebsajti duhet të jetë një URL i vlefshëm"
    }
  }
};

/**
 * Common validation rules for Post Job form
 */
export const postJobRules = {
  step0: {
    title: {
      required: true,
      minLength: 5,
      maxLength: 100,
      message: "Titulli duhet të jetë midis 5 dhe 100 karakteresh"
    },
    description: {
      required: true,
      minLength: 50,
      maxLength: 5000,
      message: "Përshkrimi duhet të jetë midis 50 dhe 5000 karakteresh"
    },
    category: {
      required: true,
      message: "Kategoria është e detyrueshme"
    },
    jobType: {
      required: true,
      message: "Lloji i punës është i detyrueshëm"
    }
  },
  step1: {
    city: {
      required: true,
      message: "Qyteti është i detyrueshëm"
    }
  },
  step2: {
    experienceLevel: {
      required: true,
      message: "Niveli i përvojës është i detyrueshëm"
    },
    education: {
      required: true,
      message: "Arsimi është i detyrueshëm"
    }
  },
  step3: {
    // Salary fields are optional
    salaryMin: {
      custom: (value: number) => !value || value >= 0,
      message: "Paga minimale duhet të jetë >= 0"
    },
    salaryMax: {
      custom: (value: number, formData?: any) =>
        !value || !formData?.salaryMin || value >= formData.salaryMin,
      message: "Paga maksimale duhet të jetë >= paga minimale"
    }
  },
  step4: {
    applicationMethod: {
      required: true,
      message: "Mënyra e aplikimit është e detyrueshme"
    },
    applicationEmail: {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: "Email-i i aplikimit duhet të jetë i vlefshëm"
    }
  }
};

/**
 * Common validation rules for Employer Dashboard Settings
 */
export const employerDashboardSettingsRules = {
  companyName: {
    required: true,
    minLength: 2,
    maxLength: 100,
    message: "Emri i kompanisë duhet të jetë midis 2 dhe 100 karakteresh"
  },
  description: {
    minLength: 50,
    maxLength: 500,
    message: "Përshkrimi duhet të jetë midis 50 dhe 500 karakteresh"
  },
  website: {
    pattern: /^https?:\/\/.+\..+/,
    message: "Uebsajti duhet të jetë një URL i vlefshëm"
  },
  industry: {
    required: true,
    message: "Industria është e detyrueshme"
  },
  companySize: {
    required: true,
    message: "Madhësia e kompanisë është e detyrueshme"
  },
  city: {
    required: true,
    message: "Qyteti është i detyrueshëm"
  },
  firstName: profileValidationRules.personal.firstName,
  lastName: profileValidationRules.personal.lastName,
  phone: profileValidationRules.personal.phone
};

/**
 * Helper function to get character count info for a field
 */
export const getCharacterCountInfo = (
  value: string,
  maxLength: number
): {
  count: number;
  remaining: number;
  isOverLimit: boolean;
  percentage: number;
} => {
  const count = value ? value.length : 0;
  const remaining = maxLength - count;
  const isOverLimit = count > maxLength;
  const percentage = (count / maxLength) * 100;

  return {
    count,
    remaining,
    isOverLimit,
    percentage
  };
};

/**
 * Field name translation map - English to Albanian
 */
export const fieldNameTranslations: { [key: string]: string } = {
  // Common fields
  firstName: 'Emri',
  lastName: 'Mbiemri',
  email: 'Email',
  password: 'Fjalëkalimi',
  confirmPassword: 'Konfirmimi i fjalëkalimit',
  phone: 'Telefoni',
  city: 'Qyteti',
  location: 'Vendndodhja',

  // Job seeker fields
  education: 'Arsimi',
  bio: 'Biografia',

  // Employer fields
  companyName: 'Emri i kompanisë',
  companySize: 'Madhësia e kompanisë',
  industry: 'Industria',
  description: 'Përshkrimi',
  website: 'Uebsajti',

  // Job posting fields
  title: 'Titulli i punës',
  category: 'Kategoria',
  jobType: 'Lloji i punës',
  experienceLevel: 'Niveli i përvojës',
  salaryMin: 'Paga minimale',
  salaryMax: 'Paga maksimale',
  applicationMethod: 'Mënyra e aplikimit',
  applicationEmail: 'Email-i i aplikimit',

  // Profile fields
  headline: 'Titulli profesional',
  currentPosition: 'Pozicioni aktual',
  currentCompany: 'Kompania aktuale',
  skills: 'Aftësitë',
  experience: 'Përvoja',
  currentPassword: 'Fjalëkalimi aktual',
  newPassword: 'Fjalëkalimi i ri',

  // Work experience fields
  position: 'Pozicioni',
  company: 'Kompania',
  achievements: 'Arritjet',

  // Education fields
  degree: 'Diploma/Grada',
  fieldOfStudy: 'Fusha e studimit',
  institution: 'Institucioni',

  // Date fields
  startDate: 'Data e fillimit',
  endDate: 'Data e mbarimit'
};

/**
 * Helper function to translate field name to Albanian
 */
export const translateFieldName = (fieldName: string): string => {
  return fieldNameTranslations[fieldName] || fieldName;
};

/**
 * Helper function to format validation errors for toast display
 */
export const formatValidationErrors = (errors: ValidationError[]): string => {
  if (errors.length === 0) return '';

  if (errors.length === 1) {
    return errors[0].message;
  }

  // Group errors by type for better readability
  const requiredErrors = errors.filter(e => e.message.includes('detyrueshëm'));
  const lengthErrors = errors.filter(e => e.message.includes('karaktere'));
  const formatErrors = errors.filter(e =>
    e.message.includes('format') || e.message.includes('vlefshëm')
  );

  let message = '';

  if (requiredErrors.length > 0) {
    const fields = requiredErrors.map(e => translateFieldName(e.field)).join(', ');
    message += `Fushat e detyrueshme: ${fields}. `;
  }

  if (lengthErrors.length > 0) {
    message += lengthErrors.map(e => e.message).join('. ') + '. ';
  }

  if (formatErrors.length > 0) {
    message += formatErrors.map(e => e.message).join('. ');
  }

  return message.trim();
};
