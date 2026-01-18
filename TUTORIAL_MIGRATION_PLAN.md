# Tutorial System Migration Plan
## Complete Implementation Strategy for All Pages

**Date**: 2026-01-17
**Status**: PLANNING
**Priority**: HIGH

---

## Executive Summary

This document outlines the complete migration strategy for standardizing ALL tutorial systems across the albania-jobflow platform. Currently, we have **6 pages with tutorials** using different implementations, causing maintenance complexity and inconsistent user experience.

**Critical Finding**: Field validation feature (blocking navigation if required fields aren't filled) **ALREADY EXISTS** in PostJob.tsx (lines 454-531) and EmployersPage.tsx (lines 245, 299). The implementation plan will extend this existing pattern to ALL forms across the platform for consistency.

---

## Current State Analysis

### Pages with Tutorial Systems

| Page | Implementation Type | Complexity | Tab Switching | Form Steps | Tutorial Steps |
|------|-------------------|------------|---------------|------------|----------------|
| **Profile.tsx** | Complex (Profile.tsx style) | Very High | Yes (3 tabs) | No | 13 steps |
| **EmployerDashboard.tsx** | Simple (inline positioning) | Medium | Yes (2 tabs) | No | ~12 steps |
| **JobSeekersPage.tsx** | Simple (fixed position) | Low | No | No | 5 (full) + 5 (quick) |
| **EmployersPage.tsx** | Complex (multi-step form) | High | No | Yes (3 steps) | ~9 steps |
| **PostJob.tsx** | Complex (multi-step form) | High | No | Yes (5 steps) | ~15 steps |
| **JobDetail.tsx** | Simple (single page) | Low | No | No | ~7 steps |

### Implementation Patterns Identified

#### Pattern A: Profile.tsx (Complex Multi-Tab)
**File**: `/frontend/src/pages/Profile.tsx`

**Characteristics**:
- **Scroll Management**: Complex pixel calculations for mobile/desktop (lines 728-942)
- **Tab Awareness**: Automatic tab switching when navigating steps (lines 526-548, 656-717)
- **Scroll Lock**: Comprehensive event prevention (lines 569-596)
- **Mobile Optimization**: Smart card positioning to ensure element + card visibility (lines 789-881)
- **Tutorial Card**: Separate TutorialOverlay component with complex positioning (lines 944-1142)

**Code Snippet** (Mobile Scroll Logic):
```typescript
// Lines 789-836: Complex mobile scroll calculation
if (isMobile) {
  const currentScroll = window.pageYOffset;
  const elementTop = rect.top + currentScroll;
  const cardHeight = Math.min(450, Math.max(minCardHeight, viewportHeight * 0.45));
  const gap = 8;

  const elementBottom = rect.bottom;
  const spaceBelow = viewportHeight - elementBottom;
  const fitsBelow = spaceBelow >= cardHeight + gap + 16;

  if (fitsBelow) {
    // Card will be BELOW element
    const elementTargetPosition = viewportHeight * 0.25;
    targetScroll = (rect.top + currentScroll) - elementTargetPosition + scrollOffsetValue;
  } else {
    // Card will be ABOVE element - calculate to show full element
    const minElementTop = cardHeight + gap + 8;
    const maxElementTop = viewportHeight - bottomMargin - elementHeight + scrollOffsetValue;
    const centeredTop = cardHeight + gap + ((viewportHeight - cardHeight - gap - elementHeight) / 2);
    const elementTopInViewport = Math.max(minElementTop, Math.min(centeredTop, maxElementTop));
    targetScroll = (rect.top + currentScroll) - elementTopInViewport + scrollOffsetValue;
  }

  window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
}
```

#### Pattern B: EmployerDashboard.tsx (Simplified Inline)
**File**: `/frontend/src/pages/EmployerDashboard.tsx`

**Characteristics**:
- **Positioning**: Inline conditional logic in style props (lines 2095-2199)
- **Tab Awareness**: Manual tab switching with `getCurrentTutorialSteps()` helper
- **Scroll Lock**: Basic (no comprehensive event prevention)
- **Tutorial Card**: Inline div with calculated position

**Code Snippet** (Inline Positioning):
```typescript
// Lines 2156-2199: Inline positioning logic
<div style={{
  position: 'absolute',
  top: (() => {
    const step = getCurrentTutorialSteps()[tutorialStep];
    const cardHeight = 220;

    if (step.position === 'bottom') {
      return Math.min(elementPosition.bottom + 20, window.innerHeight - cardHeight - 20);
    } else if (step.position === 'top') {
      const preferredTop = elementPosition.top - cardHeight - 20;
      return preferredTop < 20 ? elementPosition.bottom + 20 : preferredTop;
    } else {
      return Math.max(20, Math.min(elementPosition.top, window.innerHeight - cardHeight - 20));
    }
  })(),
  left: (() => {
    const cardWidth = 300;
    if (step.position === 'left') {
      const preferredLeft = elementPosition.left - cardWidth - 20;
      return preferredLeft < 20 ? elementPosition.right + 20 : preferredLeft;
    }
    return Math.max(20, Math.min(
      elementPosition.left + (elementPosition.width / 2) - (cardWidth / 2),
      window.innerWidth - cardWidth - 20
    ));
  })()
}}>
  {/* Tutorial Card Content */}
</div>
```

#### Pattern C: JobSeekersPage.tsx (Fixed Position)
**File**: `/frontend/src/pages/JobSeekersPage.tsx`

**Characteristics**:
- **Positioning**: Fixed bottom-right position (lines 619-703)
- **Scroll Strategy**: Desktop scrolls once at start, mobile scrolls as needed (lines 394-523)
- **Scroll Lock**: Uses ref-based lock with event prevention (lines 326-360)
- **Dual Forms**: Switches tutorial steps based on form type (lines 98-166)

**Code Snippet** (Fixed Card Position):
```typescript
// Lines 619-703: Fixed position tutorial card
<div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-2xl border border-gray-200 pointer-events-auto max-w-sm w-80"
  style={{
    maxHeight: '60vh',
    transition: 'all 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
    transform: showTutorial ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(10px)',
    opacity: showTutorial ? 1 : 0,
    zIndex: 10001
  }}
>
  {/* Tutorial content - never moves */}
</div>
```

**Desktop Scroll Strategy**:
```typescript
// Lines 394-436: Scroll once strategy
if (!isMobile) {
  if (isFirstStep && !hasScrolledOnDesktop) {
    // Scroll ONCE to center form
    isScrollLockedRef.current = false;
    document.body.style.overflow = 'auto';

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHasScrolledOnDesktop(true);

    setTimeout(() => {
      document.body.style.overflow = 'hidden';
      isScrollLockedRef.current = true; // Re-lock
    }, 400);
  } else {
    // After first scroll, NEVER scroll again - just highlight
    setHighlightedElement(element);
    setElementPosition(rect);
  }
}
```

#### Pattern D: EmployersPage.tsx & PostJob.tsx (Multi-Step Form)
**Files**:
- `/frontend/src/pages/EmployersPage.tsx`
- `/frontend/src/pages/PostJob.tsx`

**Characteristics**:
- **Form Step Tracking**: Tutorial steps mapped to form steps (e.g., `formStep: 0`)
- **Step Memory**: Remembers tutorial position per form step (lines 47, 217-218 in EmployersPage)
- **Smart Start**: Starts tutorial from first step of current form page
- **Conditional Steps**: Different tutorial steps for different form pages

**Code Snippet** (Step Memory):
```typescript
// EmployersPage.tsx lines 47, 217-219
const [tutorialStepsByFormStep, setTutorialStepsByFormStep] = useState<{[key: number]: number}>({});

const startTutorial = () => {
  const firstStepForCurrentForm = tutorialSteps.findIndex(step => step.formStep === currentStep);
  const startingStep = tutorialStepsByFormStep[currentStep] !== undefined
    ? tutorialStepsByFormStep[currentStep]
    : (firstStepForCurrentForm >= 0 ? firstStepForCurrentForm : 0);

  setTutorialStep(startingStep);
  setShowTutorial(true);
};
```

---

## Proposed Solution: Unified Tutorial System

### Architecture Overview

Create a **reusable, configurable Tutorial system** that supports all use cases:

```
/frontend/src/components/Tutorial/
├── TutorialProvider.tsx       # Context provider for tutorial state
├── TutorialContext.tsx         # Hook: useTutorial()
├── TutorialOverlay.tsx         # Rendering component
├── TutorialTrigger.tsx         # Start button component
├── useFieldValidation.ts       # NEW: Field validation hook
├── useScrollManagement.ts      # Scroll logic extraction
├── types.ts                    # TypeScript interfaces
└── index.ts                    # Exports
```

### Configuration Options

```typescript
// types.ts
export interface TutorialStep {
  selector: string;              // CSS selector for element
  title: string;                 // Step title
  content: string;               // Step description
  position: 'top' | 'bottom' | 'left' | 'right';

  // Optional: Tab/Form step metadata
  tab?: string;                  // For multi-tab tutorials (Profile, EmployerDashboard)
  requiresTab?: string;          // Auto-switch to this tab
  formStep?: number;             // For multi-step forms (PostJob, EmployersPage)

  // Optional: Scroll behavior
  skipScroll?: boolean;          // Don't scroll for this step
  scrollOffset?: number;         // Manual scroll adjustment (px)
  isLargeElement?: boolean;      // Element taller than 50% viewport
  maxHeight?: number;            // Max highlighted height

  // NEW: Field validation
  requiredFields?: string[];     // CSS selectors of required fields
  optionalFields?: string[];     // CSS selectors of optional fields
  validationMessage?: string;    // Custom error message
}

export interface TutorialConfig {
  steps: TutorialStep[];

  // Positioning strategy
  mode: 'simple' | 'advanced' | 'fixed';
  // - 'simple': Inline conditional positioning (EmployerDashboard style)
  // - 'advanced': Complex mobile scroll calculations (Profile style)
  // - 'fixed': Fixed position card (JobSeekersPage style)

  // Features
  enableScrollLock?: boolean;    // Default: true
  enableFieldValidation?: boolean; // Default: false
  enableTabSwitching?: boolean;   // Default: false
  enableFormStepTracking?: boolean; // Default: false

  // Styling
  cardPosition?: 'auto' | 'bottom-right' | 'bottom-left';
  theme?: 'default' | 'yellow' | 'blue';
}
```

---

## Implementation Plan

### Phase 1: Create Reusable Tutorial System (Week 1)

#### Step 1.1: Extract Core Tutorial Logic

**Files to Create**:
1. `/frontend/src/components/Tutorial/TutorialContext.tsx`
2. `/frontend/src/components/Tutorial/types.ts`
3. `/frontend/src/components/Tutorial/useScrollManagement.ts`

**Extract from Profile.tsx**:
- `highlightElement()` function → `useScrollManagement.ts`
- `startTutorial()`, `nextTutorialStep()`, `previousTutorialStep()`, `closeTutorial()` → `TutorialContext.tsx`
- Scroll lock logic → `TutorialContext.tsx`
- Tutorial state management → `TutorialContext.tsx`

**Code Structure**:
```typescript
// TutorialContext.tsx
import { createContext, useContext, useState, useRef, useCallback } from 'react';
import { TutorialStep, TutorialConfig } from './types';
import { useScrollManagement } from './useScrollManagement';

interface TutorialContextValue {
  showTutorial: boolean;
  tutorialStep: number;
  highlightedElement: Element | null;
  elementPosition: DOMRect | null;
  isTransitioning: boolean;

  startTutorial: (stepIndex?: number) => void;
  nextTutorialStep: () => void;
  previousTutorialStep: () => void;
  closeTutorial: () => void;
  jumpToStep: (stepIndex: number) => void;
}

export const TutorialProvider = ({
  steps,
  config,
  currentTab, // For tab-aware tutorials
  currentFormStep, // For form-step tutorials
  children
}: {
  steps: TutorialStep[];
  config: TutorialConfig;
  currentTab?: string;
  currentFormStep?: number;
  children: React.ReactNode;
}) => {
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isScrollLockedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const { highlightElement } = useScrollManagement({
    mode: config.mode,
    steps,
    currentTab,
    setHighlightedElement,
    setElementPosition,
    isScrollLockedRef,
    timersRef
  });

  // Implementation of tutorial navigation...

  return (
    <TutorialContext.Provider value={/* ... */}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) throw new Error('useTutorial must be used within TutorialProvider');
  return context;
};
```

#### Step 1.2: Create Field Validation System (NEW FEATURE)

**File**: `/frontend/src/components/Tutorial/useFieldValidation.ts`

```typescript
import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface ValidationResult {
  isValid: boolean;
  emptyRequiredFields: string[];
  emptyOptionalFields: string[];
  fieldLabels: Map<string, string>; // selector -> user-friendly label
}

export const useFieldValidation = () => {
  const { toast } = useToast();

  // Get user-friendly label for a field
  const getFieldLabel = (selector: string): string => {
    const element = document.querySelector(selector);
    if (!element) return selector;

    // Try to find associated label
    const labelElement = element.closest('[data-tutorial]')?.querySelector('label');
    if (labelElement) return labelElement.textContent || selector;

    // Try placeholder
    const placeholder = (element as HTMLInputElement).placeholder;
    if (placeholder) return placeholder;

    return selector;
  };

  const validateFields = useCallback((
    requiredFields: string[] = [],
    optionalFields: string[] = []
  ): ValidationResult => {
    const emptyRequired: string[] = [];
    const emptyOptional: string[] = [];
    const fieldLabels = new Map<string, string>();

    // Check required fields
    requiredFields.forEach(selector => {
      const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (!element) {
        console.warn(`Required field not found: ${selector}`);
        return;
      }

      fieldLabels.set(selector, getFieldLabel(selector));

      const value = element.value.trim();
      const isSelect = element.tagName === 'SELECT';
      const isCheckbox = (element as HTMLInputElement).type === 'checkbox';

      if (isCheckbox) {
        if (!(element as HTMLInputElement).checked) emptyRequired.push(selector);
      } else if (isSelect) {
        if (!value || value === '' || value === 'placeholder') emptyRequired.push(selector);
      } else {
        if (!value) emptyRequired.push(selector);
      }
    });

    // Check optional fields
    optionalFields.forEach(selector => {
      const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!element) return;

      fieldLabels.set(selector, getFieldLabel(selector));

      if (!element.value.trim()) {
        emptyOptional.push(selector);
      }
    });

    return {
      isValid: emptyRequired.length === 0,
      emptyRequiredFields: emptyRequired,
      emptyOptionalFields: emptyOptional,
      fieldLabels
    };
  }, []);

  const showValidationToast = useCallback((
    result: ValidationResult,
    customMessage?: string
  ) => {
    if (result.emptyRequiredFields.length > 0) {
      const fieldNames = result.emptyRequiredFields
        .map(selector => result.fieldLabels.get(selector) || selector)
        .join(', ');

      toast({
        title: "Fushat e kërkuara nuk janë plotësuar",
        description: customMessage || `Ju lutem plotësoni: ${fieldNames}`,
        variant: "destructive"
      });

      // Scroll to first empty required field
      const firstEmptyField = document.querySelector(result.emptyRequiredFields[0]);
      if (firstEmptyField) {
        firstEmptyField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash red border
        (firstEmptyField as HTMLElement).style.borderColor = 'red';
        setTimeout(() => {
          (firstEmptyField as HTMLElement).style.borderColor = '';
        }, 2000);
      }

      return false;
    }

    if (result.emptyOptionalFields.length > 0) {
      const fieldNames = result.emptyOptionalFields
        .map(selector => result.fieldLabels.get(selector) || selector)
        .join(', ');

      toast({
        title: "Fushat opsionale janë bosh",
        description: `Fushat opsionale që nuk janë plotësuar: ${fieldNames}. Mund të vazhdoni ose të ktheheni mbrapa për t'i plotësuar.`,
        variant: "default" // Info toast
      });
    }

    return true;
  }, [toast]);

  return { validateFields, showValidationToast };
};
```

#### Step 1.3: Create Tutorial Overlay Component

**File**: `/frontend/src/components/Tutorial/TutorialOverlay.tsx`

```typescript
import { useTutorial } from './TutorialContext';
import { TutorialConfig } from './types';

export const TutorialOverlay = ({ config }: { config: TutorialConfig }) => {
  const {
    showTutorial,
    tutorialStep,
    highlightedElement,
    elementPosition,
    isTransitioning,
    steps,
    nextTutorialStep,
    previousTutorialStep,
    closeTutorial
  } = useTutorial();

  if (!showTutorial || !elementPosition) return null;

  const currentStep = steps[tutorialStep];
  if (!currentStep) return null;

  // Render based on config.mode
  if (config.mode === 'fixed') {
    return <FixedPositionOverlay {...props} />;
  } else if (config.mode === 'simple') {
    return <SimplePositionOverlay {...props} />;
  } else {
    return <AdvancedPositionOverlay {...props} />;
  }
};
```

---

### Phase 2: Migrate Each Page (Weeks 2-4)

#### Migration Priority Order

1. **Profile.tsx** (Week 2) - Most complex, validates the 'advanced' mode
2. **EmployerDashboard.tsx** (Week 2) - Validates tab switching
3. **JobSeekersPage.tsx** (Week 3) - Validates 'fixed' mode
4. **PostJob.tsx** (Week 3) - Validates form step tracking
5. **EmployersPage.tsx** (Week 4) - Similar to PostJob
6. **JobDetail.tsx** (Week 4) - Simplest, validates 'simple' mode

#### Per-Page Migration Checklist

For each page:

- [ ] **Step 1**: Identify current tutorial implementation
- [ ] **Step 2**: Map tutorial steps to new TutorialStep interface
- [ ] **Step 3**: Determine appropriate config (mode, features)
- [ ] **Step 4**: Add field validation config to steps (if applicable)
- [ ] **Step 5**: Wrap component with `<TutorialProvider>`
- [ ] **Step 6**: Replace tutorial state with `useTutorial()` hook
- [ ] **Step 7**: Remove old tutorial code (state, functions, overlay component)
- [ ] **Step 8**: Test on mobile and desktop
- [ ] **Step 9**: Test field validation (if enabled)
- [ ] **Step 10**: Update tests (if applicable)

---

### Phase 3: Add Field Validation (Week 5)

#### Implementation Steps

1. **Define validation rules for each page**:
   - Profile.tsx: Personal info fields (firstName, lastName, phone), CV upload
   - EmployerDashboard.tsx: Company info (companyName, industry, companySize)
   - JobSeekersPage.tsx: Registration fields
   - PostJob.tsx: Job posting fields per step
   - EmployersPage.tsx: Employer registration per step

2. **Update tutorial step definitions**:
```typescript
// Example: Profile.tsx step with validation
{
  selector: '[data-tutorial="personal-info-section"]',
  title: "Të Dhënat Personale",
  content: "Këtu mund të ndryshoni emrin, telefonin...",
  position: "right",
  tab: "personal",
  requiresTab: "personal",
  requiredFields: ['#firstName', '#lastName', '#phone'],
  optionalFields: ['#location', '#bio'],
  validationMessage: "Emri, mbiemri dhe telefoni janë të detyrueshëm"
}
```

3. **Integrate validation into navigation**:
```typescript
// In TutorialContext.tsx nextTutorialStep()
const nextTutorialStep = () => {
  if (isTransitioning) return;

  const currentStep = steps[tutorialStep];

  // NEW: Field validation
  if (config.enableFieldValidation && currentStep.requiredFields) {
    const result = validateFields(
      currentStep.requiredFields,
      currentStep.optionalFields
    );

    if (!result.isValid) {
      showValidationToast(result, currentStep.validationMessage);
      return; // Block navigation
    }

    // Show info for optional fields
    if (result.emptyOptionalFields.length > 0) {
      showValidationToast(result);
      // Don't block - just notify
    }
  }

  // Original navigation logic...
};
```

---

## Detailed Migration Examples

### Example 1: Profile.tsx Migration

**Before** (lines 28-72):
```typescript
// Old state
const [showTutorial, setShowTutorial] = useState(false);
const [tutorialStep, setTutorialStep] = useState(0);
const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
const [elementPosition, setElementPosition] = useState<DOMRect | null>(null);
// ... more state

// Old tutorial steps
const allTutorialSteps = [
  {
    selector: '[data-tutorial="tabs"]',
    title: "Tabat e Profilit",
    content: "Profili juaj ka 3 tab kryesore...",
    position: "bottom" as const,
    tab: "personal",
    requiresTab: "personal",
    skipScroll: true
  },
  // ... 12 more steps
];
```

**After**:
```typescript
import { TutorialProvider, useTutorial } from '@/components/Tutorial';
import { TutorialStep } from '@/components/Tutorial/types';

const Profile = () => {
  const [currentTab, setCurrentTab] = useState("personal");

  // Define tutorial steps with validation
  const tutorialSteps: TutorialStep[] = [
    {
      selector: '[data-tutorial="tabs"]',
      title: "Tabat e Profilit",
      content: "Profili juaj ka 3 tab kryesore...",
      position: "bottom",
      tab: "personal",
      requiresTab: "personal",
      skipScroll: true
    },
    {
      selector: '[data-tutorial="personal-info-section"]',
      title: "Të Dhënat Personale",
      content: "Këtu mund të ndryshoni emrin, telefonin...",
      position: "right",
      tab: "personal",
      requiresTab: "personal",
      isLargeElement: true,
      scrollOffset: -120,
      // NEW: Validation
      requiredFields: ['#firstName', '#lastName', '#phone'],
      optionalFields: ['#location', '#bio'],
      validationMessage: "Emri, mbiemri dhe telefoni janë të detyrueshëm"
    },
    // ... more steps
  ];

  return (
    <TutorialProvider
      steps={tutorialSteps}
      config={{
        mode: 'advanced', // Use Profile.tsx complex scroll calculations
        enableScrollLock: true,
        enableFieldValidation: true,
        enableTabSwitching: true,
        cardPosition: 'auto'
      }}
      currentTab={currentTab}
    >
      <ProfileContent />
    </TutorialProvider>
  );
};

const ProfileContent = () => {
  const { showTutorial, startTutorial } = useTutorial();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Tutorial trigger */}
      {!showTutorial && (
        <Card className="border-blue-200 bg-blue-50/50 mb-6">
          <CardContent className="p-4">
            <Button onClick={startTutorial}>Fillo Tutorialin</Button>
          </CardContent>
        </Card>
      )}

      {/* Rest of page content */}
    </div>
  );
};
```

**Lines Removed**: ~900 lines (all tutorial logic moved to reusable components)

---

### Example 2: JobSeekersPage.tsx Migration

**Before** (lines 42-706):
```typescript
// Old: 665 lines of tutorial code
const [showTutorial, setShowTutorial] = useState(false);
// ... extensive tutorial state and functions
```

**After**:
```typescript
import { TutorialProvider, TutorialTrigger } from '@/components/Tutorial';

const JobSeekersPage = () => {
  const [showQuickForm, setShowQuickForm] = useState(false);

  const fullFormSteps: TutorialStep[] = [/* ... */];
  const quickFormSteps: TutorialStep[] = [/* ... */];

  const currentSteps = showQuickForm ? quickFormSteps : fullFormSteps;

  return (
    <TutorialProvider
      steps={currentSteps}
      config={{
        mode: 'fixed', // Fixed bottom-right position
        enableScrollLock: true,
        cardPosition: 'bottom-right',
        theme: 'yellow'
      }}
    >
      <JobSeekersContent />
    </TutorialProvider>
  );
};
```

**Lines Removed**: ~665 lines

---

### Example 3: PostJob.tsx Migration (Multi-Step Form)

**Before**:
```typescript
const [tutorialStepsByFormStep, setTutorialStepsByFormStep] = useState<{[key: number]: number}>({});
// Complex form step tracking
```

**After**:
```typescript
const PostJob = () => {
  const [currentStep, setCurrentStep] = useState(0);

  const tutorialSteps: TutorialStep[] = [
    // Step 0 fields
    {
      selector: '[data-tutorial="job-title"]',
      title: "Titulli i Punës",
      content: "...",
      position: "bottom",
      formStep: 0, // Maps to form step
      requiredFields: ['#job-title'],
      validationMessage: "Titulli i punës është i detyrueshëm"
    },
    // Step 1 fields
    {
      selector: '[data-tutorial="job-description"]',
      title: "Përshkrimi",
      content: "...",
      position: "bottom",
      formStep: 1,
      requiredFields: ['#job-description'],
      optionalFields: ['#requirements'],
    },
    // ... more steps
  ];

  return (
    <TutorialProvider
      steps={tutorialSteps}
      config={{
        mode: 'simple',
        enableFormStepTracking: true,
        enableFieldValidation: true,
      }}
      currentFormStep={currentStep}
    >
      <PostJobContent />
    </TutorialProvider>
  );
};
```

---

## Testing Strategy

### Unit Tests

**File**: `/frontend/src/components/Tutorial/__tests__/TutorialContext.test.tsx`

```typescript
describe('TutorialContext', () => {
  it('should start tutorial from first step', () => {
    // Test startTutorial()
  });

  it('should navigate to next step', () => {
    // Test nextTutorialStep()
  });

  it('should block navigation if required fields empty', () => {
    // Test field validation blocking
  });

  it('should switch tabs automatically', () => {
    // Test tab switching
  });

  it('should remember position per form step', () => {
    // Test form step tracking
  });
});
```

### Integration Tests

**File**: `/frontend/e2e/tutorial.spec.ts`

```typescript
test('Profile tutorial completes successfully', async ({ page }) => {
  await page.goto('/profile');
  await page.click('button:has-text("Fillo Tutorialin")');

  // Step through all 13 steps
  for (let i = 0; i < 13; i++) {
    await page.click('button:has-text("Tjetër")');
  }

  // Should close on last step
  await expect(page.locator('.tutorial-overlay')).not.toBeVisible();
});

test('Field validation blocks navigation', async ({ page }) => {
  await page.goto('/profile');
  await page.click('button:has-text("Fillo Tutorialin")');

  // Navigate to step with required fields
  await page.click('button:has-text("Tjetër")');
  await page.click('button:has-text("Tjetër")');

  // Try to advance without filling required fields
  await page.click('button:has-text("Tjetër")');

  // Should show error toast
  await expect(page.locator('.toast:has-text("Fushat e kërkuara")')).toBeVisible();

  // Should still be on same step
  await expect(page.locator('.tutorial-step-indicator')).toHaveText('3 / 13');
});
```

---

## Migration Timeline

| Week | Phase | Tasks | Deliverables |
|------|-------|-------|-------------|
| **Week 1** | Foundation | Create reusable Tutorial system | TutorialProvider, types, hooks, tests |
| **Week 2** | Migration 1 | Profile.tsx + EmployerDashboard.tsx | 2 pages migrated, 'advanced' mode validated |
| **Week 3** | Migration 2 | JobSeekersPage.tsx + PostJob.tsx | 2 pages migrated, 'fixed' + form tracking validated |
| **Week 4** | Migration 3 | EmployersPage.tsx + JobDetail.tsx | All 6 pages migrated |
| **Week 5** | Validation | Add field validation to all pages | Validation working across all tutorials |
| **Week 6** | Testing | E2E tests, mobile testing, bug fixes | Production-ready system |

---

## Success Criteria

### Technical Metrics

- [ ] All 6 pages use TutorialProvider
- [ ] Zero tutorial-related code duplication across pages
- [ ] Field validation working on all pages with forms
- [ ] Tab switching working (Profile, EmployerDashboard)
- [ ] Form step tracking working (PostJob, EmployersPage)
- [ ] Mobile scroll calculations working correctly
- [ ] All E2E tutorial tests passing
- [ ] Code reduction: -3000+ lines across codebase

### User Experience Metrics

- [ ] Tutorial completion rate > 80%
- [ ] Tutorial abandonment rate < 15%
- [ ] No user-reported tutorial bugs for 2 weeks
- [ ] Consistent tutorial UI/UX across all pages

---

## Rollback Plan

If critical bugs are found during migration:

1. **Revert to old implementation** (per page)
2. **Fix issues in TutorialProvider** without blocking other pages
3. **Re-migrate page** once fixed
4. **Keep old tutorial code in comments** for first 2 weeks after migration

---

## Documentation Requirements

1. **Developer Documentation**:
   - How to add tutorial to new page
   - How to configure TutorialProvider
   - How to add field validation
   - Troubleshooting guide

2. **API Documentation**:
   - TutorialStep interface
   - TutorialConfig interface
   - useTutorial() hook methods
   - useFieldValidation() hook methods

3. **Migration Guide**:
   - Step-by-step migration checklist
   - Common migration patterns
   - Before/after code examples

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing tutorials | Medium | High | Gradual migration, keep old code for 2 weeks |
| Field validation bugs | Medium | Medium | Extensive testing, soft launch with opt-in |
| Mobile scroll issues | Low | High | Reuse proven Profile.tsx logic |
| Tab switching breaks | Low | Medium | Comprehensive E2E tests |
| Performance regression | Low | Low | Profile tutorials

---

## Post-Migration Optimization

After all pages are migrated:

1. **Code Splitting**: Lazy load Tutorial components
2. **Performance**: Profile tutorial overlay rendering
3. **Analytics**: Add tutorial completion tracking
4. **A/B Testing**: Test different tutorial copy
5. **Accessibility**: Add ARIA labels, keyboard navigation

---

## Appendix

### A. File Structure After Migration

```
/frontend/src/
├── components/
│   └── Tutorial/
│       ├── TutorialProvider.tsx       (300 lines)
│       ├── TutorialContext.tsx        (200 lines)
│       ├── TutorialOverlay.tsx        (400 lines)
│       ├── TutorialTrigger.tsx        (50 lines)
│       ├── useFieldValidation.ts      (150 lines)
│       ├── useScrollManagement.ts     (500 lines)
│       ├── types.ts                   (100 lines)
│       ├── __tests__/
│       │   ├── TutorialContext.test.tsx
│       │   ├── useFieldValidation.test.ts
│       │   └── useScrollManagement.test.ts
│       └── index.ts                   (20 lines)
├── pages/
│   ├── Profile.tsx                    (-900 lines tutorial code)
│   ├── EmployerDashboard.tsx          (-600 lines tutorial code)
│   ├── JobSeekersPage.tsx             (-665 lines tutorial code)
│   ├── PostJob.tsx                    (-500 lines tutorial code)
│   ├── EmployersPage.tsx              (-450 lines tutorial code)
│   └── JobDetail.tsx                  (-200 lines tutorial code)
```

**Total Code Reduction**: -3,315 lines
**New Reusable Code**: +1,720 lines
**Net Reduction**: -1,595 lines (48% reduction)

### B. Tutorial Step Counts by Page

| Page | Current Steps | After Migration | Validation Steps |
|------|--------------|-----------------|------------------|
| Profile.tsx | 13 | 13 | 5 |
| EmployerDashboard.tsx | 12 | 12 | 4 |
| JobSeekersPage.tsx | 5+5 (dual) | 5+5 | 3+3 |
| PostJob.tsx | 15 | 15 | 8 |
| EmployersPage.tsx | 9 | 9 | 5 |
| JobDetail.tsx | 7 | 7 | 0 |
| **Total** | **71** | **71** | **28** |

---

## Conclusion

This migration will:
1. **Eliminate 3,315 lines** of duplicated tutorial code
2. **Add field validation** to 28 tutorial steps across 6 pages
3. **Standardize** tutorial UX across the platform
4. **Enable rapid** addition of tutorials to new pages (< 100 lines of code)
5. **Improve maintainability** with single source of truth

**Estimated Effort**: 6 weeks (1 developer)
**Risk Level**: Medium (gradual migration reduces risk)
**Impact**: High (better UX, easier maintenance, faster feature development)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-17
**Author**: AI Assistant (Claude)
**Reviewers**: TBD
