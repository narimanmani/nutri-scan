import { useEffect, useMemo, useRef, useState } from 'react';
import MuscleSelector, { MUSCLE_GROUPS } from '@/components/workout/MuscleSelector.jsx';
import { generateWorkoutPlanFromMuscles } from '@/api/wger.js';

const BODY_VIEWS = ['front', 'back'];

function sanitizeHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function WorkoutPlanner() {
  const [view, setView] = useState('front');
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [plan, setPlan] = useState([]);
  const [error, setError] = useState('');
  const abortRef = useRef();

  const selectedMuscles = useMemo(
    () => MUSCLE_GROUPS.filter((group) => selectedKeys.includes(group.key)),
    [selectedKeys]
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const toggleMuscle = (muscle) => {
    setSelectedKeys((prev) =>
      prev.includes(muscle.key) ? prev.filter((key) => key !== muscle.key) : [...prev, muscle.key]
    );
  };

  const handleGeneratePlan = async () => {
    if (selectedMuscles.length === 0) {
      setError('Select at least one muscle group to generate a workout plan.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setPlan([]);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await generateWorkoutPlanFromMuscles(selectedMuscles, {
        exercisesPerMuscle: 3,
        signal: controller.signal,
      });

      if (result.length === 0) {
        setError('No exercises found. Try selecting different muscles.');
      }

      setPlan(result);
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      setError(
        'We could not reach the wger workout database. Please check your connection and try again.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-500">Training</p>
        <h1 className="text-3xl font-bold text-emerald-950 sm:text-4xl">Personalized Workout Planner</h1>
        <p className="max-w-3xl text-base text-emerald-900/80 sm:text-lg">
          Explore the interactive anatomy map to choose the muscles you want to focus on. Once you have
          selected your targets, we will pull curated exercises from the wger open-source fitness API to
          craft a balanced routine for your session.
        </p>
      </header>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-6 rounded-3xl border border-emerald-100 bg-white/70 p-6 shadow-lg shadow-emerald-100/60 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-emerald-900">Anatomy Explorer</h2>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 p-1 text-xs font-semibold text-emerald-600 shadow-sm">
              {BODY_VIEWS.map((bodyView) => (
                <button
                  key={bodyView}
                  type="button"
                  onClick={() => setView(bodyView)}
                  className={`rounded-full px-3 py-1.5 transition ${
                    view === bodyView ? 'bg-emerald-500 text-white shadow-md' : 'hover:bg-emerald-100'
                  }`}
                >
                  {bodyView === 'front' ? 'Front' : 'Back'}
                </button>
              ))}
            </div>
          </div>

          <MuscleSelector view={view} selectedKeys={selectedKeys} onToggle={toggleMuscle} />
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-100 p-6 shadow-lg shadow-emerald-100/70">
            <h2 className="text-xl font-semibold text-emerald-900">Your Focus Areas</h2>
            {selectedMuscles.length === 0 ? (
              <p className="mt-3 text-sm text-emerald-800/80">
                Tap on the anatomy illustration or use the list to highlight the muscles you would like to
                train today. Selected groups will appear here with quick tips.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {selectedMuscles.map((muscle) => (
                  <li
                    key={muscle.key}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-emerald-200/60 bg-white/80 px-4 py-3 text-sm shadow-sm"
                  >
                    <div>
                      <p className="font-semibold text-emerald-900">{muscle.label}</p>
                      <p className="mt-1 text-xs text-emerald-800/70">{muscle.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleMuscle(muscle)}
                      className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 shadow-sm hover:bg-emerald-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-lg shadow-emerald-100/70">
            <h2 className="text-xl font-semibold text-emerald-900">Generate workout</h2>
            <p className="mt-2 text-sm text-emerald-800/80">
              We will use the wger public API to surface high-quality exercises for your selected muscles.
              Choose at least one group and press the button to build your plan.
            </p>
            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleGeneratePlan}
              disabled={isGenerating}
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {isGenerating ? 'Building your workout…' : 'Create workout plan'}
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-emerald-950">Workout plan</h2>
          <p className="text-sm text-emerald-900/70">
            Each block contains exercises fetched in real time from the wger database. Mix and match the sets
            and reps to match your equipment and training goals.
          </p>
        </div>

        {isGenerating && (
          <div className="rounded-3xl border border-emerald-100 bg-white/80 p-6 text-sm text-emerald-800/80 shadow-inner">
            Fetching exercises and assembling your routine…
          </div>
        )}

        {!isGenerating && plan.length === 0 && !error && (
          <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/50 p-6 text-sm text-emerald-800/70">
            Once you generate a plan, the exercises will appear here grouped by muscle.
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {plan.map((section) => (
            <article
              key={section.muscle.key}
              className="flex h-full flex-col gap-4 rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-lg shadow-emerald-100/80"
            >
              <header className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">
                    {section.muscle.view === 'front' ? 'Anterior' : 'Posterior'} chain
                  </p>
                  <h3 className="text-xl font-semibold text-emerald-900">{section.muscle.label}</h3>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {section.exercises.length} moves
                </span>
              </header>

              {section.error ? (
                <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
                  {section.error}
                </p>
              ) : (
                <ol className="space-y-4 text-sm text-emerald-900/80">
                  {section.exercises.map((exercise) => (
                    <li key={exercise.id} className="rounded-2xl border border-emerald-100/80 bg-emerald-50/60 px-4 py-3 shadow-sm">
                      <p className="font-semibold text-emerald-900">{exercise.name}</p>
                      {exercise.description && (
                        <p className="mt-1 text-xs leading-relaxed text-emerald-800/80">
                          {sanitizeHtml(exercise.description)}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
