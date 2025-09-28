import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const DEFAULT_MACROS = {
  calories: 2000,
  protein: 100,
  carbs: 220,
  fat: 70,
  fiber: 28,
};

const DEFAULT_PLAN = {
  name: '',
  goal: '',
  description: '',
  hydrationTarget: 8,
  macroTargets: DEFAULT_MACROS,
};

function normalizePlanState(plan) {
  if (!plan || typeof plan !== 'object') {
    return { ...DEFAULT_PLAN, macroTargets: { ...DEFAULT_MACROS } };
  }

  return {
    name: plan.name || '',
    goal: plan.goal || '',
    description: plan.description || '',
    hydrationTarget: Number.isFinite(Number(plan.hydrationTarget)) ? Number(plan.hydrationTarget) : 8,
    macroTargets: {
      ...DEFAULT_MACROS,
      ...(plan.macroTargets || {}),
    },
  };
}

export default function AddDietPlanDialog({ open, onOpenChange, templates = [], onSubmit }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [formValues, setFormValues] = useState(() => normalizePlanState());
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const templateOptions = useMemo(() => templates.map((template) => ({
    id: template.id,
    name: template.name,
  })), [templates]);

  useEffect(() => {
    if (!open) {
      setSelectedTemplateId('');
      setFormValues(normalizePlanState());
      setError('');
    }
  }, [open]);

  const handleTemplateChange = (event) => {
    const templateId = event.target.value;
    setSelectedTemplateId(templateId);

    const template = templates.find((item) => item.id === templateId);
    if (template) {
      setFormValues(normalizePlanState(template));
    }
  };

  const handleFieldChange = (field) => (event) => {
    const value = event.target.value;
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleMacroChange = (key) => (event) => {
    const value = Number(event.target.value);
    setFormValues((prev) => ({
      ...prev,
      macroTargets: {
        ...prev.macroTargets,
        [key]: Number.isFinite(value) ? value : 0,
      },
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const trimmedName = formValues.name.trim();
    if (!trimmedName) {
      setError('A plan name is required.');
      return;
    }

    const prepared = {
      ...formValues,
      name: trimmedName,
      goal: formValues.goal.trim(),
      description: formValues.description.trim(),
      hydrationTarget: Number.isFinite(Number(formValues.hydrationTarget))
        ? Number(formValues.hydrationTarget)
        : 8,
      macroTargets: Object.entries(formValues.macroTargets || {}).reduce((acc, [key, value]) => {
        const numericValue = Number(value);
        acc[key] = Number.isFinite(numericValue) && numericValue >= 0 ? Math.round(numericValue) : 0;
        return acc;
      }, {}),
    };

    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit?.(prepared);
      onOpenChange?.(false);
    } catch (submitError) {
      console.error(submitError);
      setError(submitError?.message || 'Unable to save the plan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a diet plan</DialogTitle>
          <DialogDescription>
            Personalize a plan or start from one of the curated templates. Targets are daily values.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {templateOptions.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="diet-plan-template">Start from a template</Label>
              <select
                id="diet-plan-template"
                value={selectedTemplateId}
                onChange={handleTemplateChange}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">Choose a template (optional)</option>
                {templateOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="diet-plan-name">Plan name *</Label>
            <Input
              id="diet-plan-name"
              value={formValues.name}
              onChange={handleFieldChange('name')}
              placeholder="e.g., Fall Focus Reset"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="diet-plan-goal">Goal</Label>
            <Input
              id="diet-plan-goal"
              value={formValues.goal}
              onChange={handleFieldChange('goal')}
              placeholder="Describe the focus of this plan"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="diet-plan-description">Description</Label>
            <Textarea
              id="diet-plan-description"
              value={formValues.description}
              onChange={handleFieldChange('description')}
              placeholder="Key guidelines, food focus, or reminders"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 bg-gray-50/70 p-4 md:grid-cols-2">
            {Object.entries(formValues.macroTargets).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`macro-${key}`}>{key.charAt(0).toUpperCase() + key.slice(1)}</Label>
                <Input
                  id={`macro-${key}`}
                  type="number"
                  min="0"
                  value={value}
                  onChange={handleMacroChange(key)}
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="hydration-target">Hydration target (glasses)</Label>
              <Input
                id="hydration-target"
                type="number"
                min="0"
                value={formValues.hydrationTarget}
                onChange={handleFieldChange('hydrationTarget')}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
