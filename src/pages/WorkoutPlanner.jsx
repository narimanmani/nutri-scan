import { useEffect, useMemo, useRef, useState } from 'react';
import MuscleSelector from '@/components/workout/MuscleSelector.jsx';
import { fetchAllMuscles, generateWorkoutPlanFromMuscles } from '@/api/wger.js';

const BODY_VIEWS = ['front', 'back'];
const WGER_ASSET_BASE_URL = 'https://wger.de';

function toAbsoluteAssetUrl(url = '') {
  if (!url) return '';

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  const normalizedBase = WGER_ASSET_BASE_URL.replace(/\/$/, '');
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${normalizedBase}${normalizedPath}`;
}

function formatDescription(name = '') {
  const cleaned = name.replace(/muscle/gi, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Add this muscle to balance your training focus.';
  }
  return `Focus on the ${cleaned.toLowerCase()} to build balanced strength and control.`;
}

function sanitizeHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => sanitizeText(item)).filter(Boolean);
}

function ExerciseAnimationPreview({ animationUrl, animationAlt, animationMeta }) {
  const [failed, setFailed] = useState(false);

  const hasMedia = Boolean(animationUrl) && !failed;
  const meta = animationMeta || {};
  const query = meta.query || {};
  const suggestion = meta.suggestion;
  const matched = Boolean(meta.matched);
  const strategy = meta.strategy;
  const score = typeof meta.score === 'number' && !Number.isNaN(meta.score) ? meta.score : null;
  const matchedTokens = Array.isArray(meta.tokens) ? meta.tokens : [];
  const descriptors = Array.isArray(meta.descriptors) ? meta.descriptors : [];
  const queryTokens = Array.isArray(query.tokens) ? query.tokens : [];
  const queryCoreTokens = Array.isArray(query.coreTokens) ? query.coreTokens : [];

  if (hasMedia) {
    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-100 bg-white/80">
        <img
          src={animationUrl}
          alt={animationAlt || 'Exercise demonstration'}
          loading="lazy"
          className="h-auto w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  const suggestionTokens = Array.isArray(suggestion?.tokens) ? suggestion.tokens : [];

  return (
    <div className="mt-3 space-y-1.5 rounded-2xl border border-dashed border-emerald-200 bg-white/70 p-4 text-[11px] text-emerald-700">
      <p className="font-semibold uppercase tracking-[0.2em] text-emerald-500">Animation unavailable</p>
      <p className="text-emerald-900">
        {matched
          ? 'A local GIF was matched but failed to render. Check the asset bundling or file path.'
          : 'No matching local GIF was located for this exercise name.'}
      </p>
      {query.requestedName && (
        <p>
          Exercise: <span className="font-medium text-emerald-900">{query.requestedName}</span>
        </p>
      )}
      {strategy && (
        <p>
          Strategy: <span className="font-medium text-emerald-900">{strategy}</span>
        </p>
      )}
      {typeof score === 'number' && score > 0 && (
        <p>
          Match score: <span className="font-medium text-emerald-900">{score.toFixed(3)}</span>
        </p>
      )}
      {queryTokens.length > 0 && (
        <p>
          Query tokens: <span className="font-mono text-emerald-800">{queryTokens.join(', ')}</span>
        </p>
      )}
      {queryCoreTokens.length > 0 && (
        <p>
          Core tokens: <span className="font-mono text-emerald-800">{queryCoreTokens.join(', ')}</span>
        </p>
      )}
      {matched && meta.fileName && (
        <p>
          Resolved file: <span className="font-mono text-emerald-800">{meta.fileName}</span>
        </p>
      )}
      {matchedTokens.length > 0 && (
        <p>
          Matched tokens: <span className="font-mono text-emerald-800">{matchedTokens.join(', ')}</span>
        </p>
      )}
      {descriptors.length > 0 && (
        <p>
          Descriptors: <span className="font-mono text-emerald-800">{descriptors.join(', ')}</span>
        </p>
      )}
      {!matched && suggestion && (
        <div className="mt-2 space-y-1 rounded-xl border border-emerald-200/60 bg-emerald-50/60 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-500">Closest candidate</p>
          <p className="font-mono text-xs text-emerald-900">{suggestion.fileName}</p>
          {suggestionTokens.length > 0 && (
            <p>
              Tokens: <span className="font-mono text-emerald-800">{suggestionTokens.join(', ')}</span>
            </p>
          )}
          {typeof suggestion.score === 'number' && suggestion.score > 0 && (
            <p>
              Score: <span className="font-medium text-emerald-900">{suggestion.score.toFixed(3)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkoutPlanner() {
  const [view, setView] = useState('front');
  const [catalog, setCatalog] = useState({ status: 'idle', muscles: [], error: '' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [plan, setPlan] = useState([]);
  const [error, setError] = useState('');
  const abortRef = useRef();

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    setCatalog({ status: 'loading', muscles: [], error: '' });

    fetchAllMuscles({ signal: controller.signal })
      .then((records) => {
        if (!isActive) return;

        const normalized = records
          .map((record) => {
            const id = record?.id;
            if (!id) return null;

            const label = record?.name_en || record?.name || `Muscle ${id}`;
            const highlightUrl = toAbsoluteAssetUrl(record?.image_url_main || record?.image_url_secondary || '');
            const secondaryUrl = toAbsoluteAssetUrl(record?.image_url_secondary || '');
            const view = record?.is_front ? 'front' : 'back';

            return {
              id,
              key: `muscle-${id}`,
              label,
              view,
              highlightUrl,
              secondaryUrl,
              apiIds: [id],
              description: formatDescription(label),
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.label.localeCompare(b.label));

        setCatalog({ status: 'success', muscles: normalized, error: '' });
        setSelectedIds((prev) => prev.filter((id) => normalized.some((muscle) => muscle.id === id)));
      })
      .catch((err) => {
        if (!isActive || err.name === 'AbortError') {
          return;
        }
        setCatalog({ status: 'error', muscles: [], error: err.message || 'Unable to load anatomy data.' });
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  const selectedMuscles = useMemo(
    () => catalog.muscles.filter((muscle) => selectedIds.includes(muscle.id)),
    [catalog.muscles, selectedIds]
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const toggleMuscle = (muscle) => {
    if (!muscle) return;
    setSelectedIds((prev) =>
      prev.includes(muscle.id) ? prev.filter((id) => id !== muscle.id) : [...prev, muscle.id]
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
      setError('We could not generate AI guidance for this workout. Please check your connection and API key.');
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
          selected your targets, we will draft a balanced routine and enrich each movement with coaching
          guidance generated by OpenAI’s GPT-4 class models.
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

          <MuscleSelector
            view={view}
            status={catalog.status}
            error={catalog.error}
            muscles={catalog.muscles}
            selectedIds={selectedIds}
            onToggle={toggleMuscle}
          />
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-100 p-6 shadow-lg shadow-emerald-100/70">
            <h2 className="text-xl font-semibold text-emerald-900">Your Focus Areas</h2>
            {selectedMuscles.length === 0 ? (
              <p className="mt-3 text-sm text-emerald-800/80">
                Tap on the anatomy illustration or use the list to highlight the muscles you would like to train today. Selected groups will appear here with quick tips.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {selectedMuscles.map((muscle) => (
                  <li
                    key={muscle.id}
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
              We will pair the wger exercise catalog with AI-generated prescriptions so every movement includes tailored cues,
              set and rep schemes, and safety guidance. Choose at least one group and press the button to build your plan.
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
              Each block pulls movements from the wger database and layers on GPT-powered programming so you know how to execute
              every rep with confidence.
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
          {plan.map((section) => {
            const focusText = sanitizeText(section.overview?.focus);
            const adaptationText = sanitizeText(section.overview?.adaptationGoal);
            const warmupTip = sanitizeText(section.overview?.warmupTip);

            return (
              <article
                key={section.muscle.id}
                className="flex h-full flex-col gap-4 rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-lg shadow-emerald-100/80"
              >
                <header className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">
                      {section.muscle.view === 'front' ? 'Anterior' : 'Posterior'} chain
                    </p>
                    <h3 className="text-xl font-semibold text-emerald-900">{section.muscle.label}</h3>
                  </div>
                </header>

                {section.overviewError ? (
                  <p className="rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-700">
                    {section.overviewError}
                  </p>
                ) : (
                  (focusText || adaptationText || warmupTip) && (
                    <div className="rounded-2xl border border-emerald-100/80 bg-emerald-50/50 p-4 text-xs text-emerald-900/80">
                      {focusText && (
                        <p>
                          <span className="font-semibold text-emerald-900">Focus:</span> {focusText}
                        </p>
                      )}
                      {adaptationText && (
                        <p className="mt-1">
                          <span className="font-semibold text-emerald-900">Goal:</span> {adaptationText}
                        </p>
                      )}
                      {warmupTip && (
                        <p className="mt-1">
                          <span className="font-semibold text-emerald-900">Warm-up:</span> {warmupTip}
                        </p>
                      )}
                    </div>
                  )
                )}

                {section.error ? (
                  <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
                    {section.error}
                  </p>
                ) : (
                  <div className="space-y-4 text-sm text-emerald-900/80" role="list">
                    {section.exercises.map((exercise) => {
                      const descriptionText = sanitizeHtml(exercise.description);
                      const prescriptionDetails = [
                        { label: 'Sets', value: sanitizeText(exercise.sets) },
                        { label: 'Reps', value: sanitizeText(exercise.reps) },
                        { label: 'Tempo', value: sanitizeText(exercise.tempo) },
                        { label: 'Rest', value: sanitizeText(exercise.rest) },
                        { label: 'Equipment', value: sanitizeText(exercise.equipment) },
                      ].filter((item) => item.value);
                      const cues = sanitizeList(exercise.cues);
                      const benefits = sanitizeList(exercise.benefits);
                      const photoUrls = sanitizeList(exercise.photoUrls);
                      const safetyNotes = sanitizeText(exercise.safetyNotes);

                      const hasPrescription = prescriptionDetails.length > 0;
                      const hasCues = cues.length > 0;
                      const hasBenefits = benefits.length > 0;
                      const hasPhotos = photoUrls.length > 0;

                      return (
                        <div
                          key={exercise.id}
                          role="listitem"
                          className="space-y-3 rounded-2xl border border-emerald-100/80 bg-emerald-50/60 px-4 py-3 shadow-sm"
                        >
                          <div>
                            <p className="font-semibold text-emerald-900">{exercise.name}</p>
                            <ExerciseAnimationPreview
                              animationUrl={exercise.animationUrl}
                              animationAlt={exercise.animationAlt || `${exercise.name} demonstration`}
                              animationMeta={exercise.animationMeta}
                            />
                            {descriptionText ? (
                              <p className="mt-1 text-xs leading-relaxed text-emerald-800/80">{descriptionText}</p>
                            ) : (
                              <p className="mt-1 text-xs italic text-emerald-800/60">
                                Detailed instructions will appear once AI guidance loads for this exercise.
                              </p>
                            )}
                            {exercise.detailError && (
                              <p className="mt-2 text-xs font-medium text-yellow-700">{exercise.detailError}</p>
                            )}
                          </div>

                          {hasPrescription && (
                            <dl className="grid gap-2 rounded-xl border border-emerald-100 bg-white/80 p-3 text-[11px] uppercase tracking-wide text-emerald-700 sm:grid-cols-2">
                              {prescriptionDetails.map((item) => (
                                <div key={`${exercise.id}-${item.label}`} className="flex flex-col gap-0.5">
                                  <dt className="text-[10px] font-semibold text-emerald-500">{item.label}</dt>
                                  <dd className="text-xs font-medium normal-case text-emerald-900">{item.value}</dd>
                                </div>
                              ))}
                            </dl>
                          )}

                          {hasCues && (
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500">
                                Coaching cues
                              </p>
                              <ul className="mt-2 space-y-1 text-xs text-emerald-800/80">
                                {cues.map((cue, index) => (
                                  <li key={`${exercise.id}-cue-${index}`} className="flex gap-2">
                                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-emerald-400" aria-hidden="true" />
                                    <span>{cue}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {hasBenefits && (
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500">
                                Why it helps
                              </p>
                              <ul className="mt-2 space-y-1 text-xs text-emerald-800/80">
                                {benefits.map((benefit, index) => (
                                  <li key={`${exercise.id}-benefit-${index}`} className="flex gap-2">
                                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-emerald-300" aria-hidden="true" />
                                    <span>{benefit}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {safetyNotes && (
                            <p className="text-[11px] font-medium text-emerald-700">
                              Safety: <span className="font-normal text-emerald-800/80">{safetyNotes}</span>
                            </p>
                          )}

                          {hasPhotos && (
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500">
                                Reference photos
                              </p>
                              <ul className="mt-2 space-y-1 text-xs text-emerald-700 underline decoration-emerald-300 underline-offset-2">
                                {photoUrls.map((url, index) => (
                                  <li key={`${exercise.id}-video-${index}`}>
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-900">
                                      {`View photo ${index + 1}`}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
