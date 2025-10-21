import { useEffect, useMemo, useRef, useState } from "react";
import { getSilhouetteAsset } from "@/utils/wgerAssets.js";
import {
  DEFAULT_MEASUREMENT_FIELDS,
  clearMeasurementPositions,
  getDefaultMeasurementPositions,
  loadDefaultMeasurementOverride,
  loadMeasurementPositions,
  mergeFieldsWithPositions,
  normalizeMeasurementPositions,
  saveDefaultMeasurementPositions,
  saveMeasurementPositions,
} from "@/utils/bodyMeasurementLayout.js";
import { useAuth } from "@/context/AuthContext.jsx";
import { User } from "@/api/entities";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function BodyMeasurementsAdmin() {
  const { user } = useAuth();
  const [positions, setPositions] = useState(() => {
    const stored = loadMeasurementPositions();
    return stored || getDefaultMeasurementPositions();
  });
  const [selectedFieldId, setSelectedFieldId] = useState(DEFAULT_MEASUREMENT_FIELDS[0].id);
  const [isDirty, setIsDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [dragState, setDragState] = useState(null);
  const svgRef = useRef(null);
  const baseImage = useMemo(() => getSilhouetteAsset("front"), []);
  const [hasCustomDefault, setHasCustomDefault] = useState(() => Boolean(loadDefaultMeasurementOverride()));
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [userError, setUserError] = useState("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState({ type: "info", message: "" });

  const measurementFields = useMemo(
    () => mergeFieldsWithPositions(DEFAULT_MEASUREMENT_FIELDS, positions),
    [positions]
  );

  const selectedField = measurementFields.find((field) => field.id === selectedFieldId) || measurementFields[0];

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const fieldBlueprint =
      measurementFields.find((field) => field.id === dragState.fieldId) ||
      DEFAULT_MEASUREMENT_FIELDS.find((field) => field.id === dragState.fieldId) ||
      DEFAULT_MEASUREMENT_FIELDS[0];

    const handlePointerMove = (event) => {
      if (!svgRef.current) return;
      const bounds = svgRef.current.getBoundingClientRect();
      const x = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
      const y = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100);

      setPositions((prev) => {
        const previousField = prev[dragState.fieldId] || {
          point: { ...fieldBlueprint.point },
          anchor: { ...fieldBlueprint.anchor },
        };

        const nextField = {
          ...previousField,
          [dragState.target]: { x, y },
        };

        return {
          ...prev,
          [dragState.fieldId]: nextField,
        };
      });
      setIsDirty(true);
      setStatusMessage("");
    };

    const handlePointerUp = () => {
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, measurementFields]);

  const handleManualChange = (fieldId, target, axis) => (event) => {
    const value = Number(event.target.value);
    if (Number.isNaN(value)) {
      return;
    }

    setPositions((prev) => {
      const blueprint =
        measurementFields.find((field) => field.id === fieldId) ||
        DEFAULT_MEASUREMENT_FIELDS.find((field) => field.id === fieldId) ||
        DEFAULT_MEASUREMENT_FIELDS[0];

      const previousField = prev[fieldId] || {
        point: { ...blueprint.point },
        anchor: { ...blueprint.anchor },
      };
      const nextField = {
        ...previousField,
        [target]: {
          ...previousField[target],
          [axis]: clamp(value, 0, 100),
        },
      };

      return {
        ...prev,
        [fieldId]: nextField,
      };
    });
    setIsDirty(true);
    setStatusMessage("");
  };

  const handleDragStart = (fieldId, target) => (event) => {
    event.preventDefault();
    setDragState({ fieldId, target });
  };

  useEffect(() => {
    if (user?.role !== "admin") {
      setRegisteredUsers([]);
      return;
    }

    let isActive = true;

    User.list()
      .then((accounts) => {
        if (!isActive || !Array.isArray(accounts)) {
          return;
        }
        setRegisteredUsers(accounts);
        setUserError("");
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        setRegisteredUsers([]);
        setUserError(error?.message || "Unable to load registered users.");
      });

    return () => {
      isActive = false;
    };
  }, [user?.role]);

  if (!user || user.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div className="rounded-3xl border border-emerald-200 bg-white/80 p-6 shadow-lg shadow-emerald-100/60">
          <h1 className="text-2xl font-semibold text-emerald-900">Administrator access required</h1>
          <p className="mt-3 text-sm text-emerald-800/80">
            The body measurement layout editor is restricted to administrator accounts. Sign in with an admin user to adjust the measurement guide positions for all members.
          </p>
        </div>
      </div>
    );
  }

  const handleSave = () => {
    saveMeasurementPositions(positions);
    setIsDirty(false);
    setStatusMessage("Measurement guides saved successfully.");
  };

  const handleReset = () => {
    const defaults = getDefaultMeasurementPositions();
    clearMeasurementPositions();
    setPositions(defaults);
    setIsDirty(false);
    setStatusMessage(
      hasCustomDefault ? "Guides reset to your saved default layout." : "Guides reset to default positions."
    );
  };

  const handleSaveAsDefault = () => {
    saveDefaultMeasurementPositions(positions);
    saveMeasurementPositions(positions);
    setHasCustomDefault(true);
    setIsDirty(false);
    setStatusMessage("Current layout saved as the new default for this device.");
  };

  const handleDownloadLayout = () => {
    try {
      const normalized = normalizeMeasurementPositions(positions);
      const blob = new Blob([JSON.stringify(normalized, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "body-measurement-layout.json";
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);
    } catch (error) {
      console.error("Failed to download layout", error);
      setStatusMessage("Unable to download the layout file. Please try again.");
    }
  };

  const handleUploadDialogOpen = () => {
    setUploadFeedback({ type: "info", message: "" });
    setIsUploadDialogOpen(true);
  };

  const handleUploadDialogClose = () => {
    setIsUploadDialogOpen(false);
    setUploadFeedback({ type: "info", message: "" });
  };

  const handleLayoutFileSelection = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const fileContents = await file.text();
      const parsed = JSON.parse(fileContents);
      const normalized = normalizeMeasurementPositions(parsed);
      setPositions(normalized);
      saveMeasurementPositions(normalized);
      setIsDirty(false);
      setStatusMessage("Layout imported and saved successfully.");
      handleUploadDialogClose();
    } catch (error) {
      console.error("Unable to import layout", error);
      setUploadFeedback({
        type: "error",
        message: "Unable to read the selected file. Ensure it is a valid layout JSON export.",
      });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-500">Admin</p>
        <h1 className="text-3xl font-bold text-emerald-950 sm:text-4xl">Body Measurement Guide Editor</h1>
        <p className="max-w-3xl text-base text-emerald-900/80 sm:text-lg">
          Drag the guide handles to align the anatomy explorer with your preferred measuring locations. Save your changes to
          update what members see in the measurement tracker.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-6 rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-lg shadow-emerald-100/60">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-emerald-900">Measurement areas</h2>
              <p className="mt-1 text-sm text-emerald-800/75">Select an area to adjust its guide points.</p>
            </div>
          </div>

          <div className="space-y-3">
            {measurementFields.map((field) => {
              const isActive = field.id === selectedFieldId;
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setSelectedFieldId(field.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                    isActive
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-lg shadow-emerald-100"
                      : "border-emerald-100 bg-white text-emerald-800 hover:border-emerald-200 hover:bg-emerald-50/60"
                  }`}
                >
                  <p className="text-sm font-semibold">{field.label}</p>
                  <p className="mt-1 text-xs text-emerald-800/70">{field.description}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4 text-sm text-emerald-800/80">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-500">Registered users</h3>
            {userError ? (
              <p className="mt-2 text-xs text-red-600">{userError}</p>
            ) : registeredUsers.length === 0 ? (
              <p className="mt-2 text-xs">No users found.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {registeredUsers.map((account) => (
                  <li
                    key={account.username}
                    className="flex items-center justify-between rounded-xl border border-emerald-100/60 bg-emerald-50/60 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">{account.displayName}</p>
                      <p className="text-xs text-emerald-700/70">{account.username}</p>
                    </div>
                    <span className="text-xs uppercase tracking-wide text-emerald-600">{account.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4 text-sm text-emerald-800/80">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-500">Tip</h3>
            <p className="mt-2">
              Use the numeric inputs below the explorer for fine-grained adjustments. Coordinates are percentages relative to the
              image boundaries.
            </p>
          </div>
        </aside>

        <section className="space-y-6 rounded-3xl border border-emerald-100 bg-white/70 p-6 shadow-lg shadow-emerald-100/60">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-emerald-900">Adjust explorer guides</h2>
              <p className="mt-1 text-sm text-emerald-800/75">
                Drag the origin dot (solid) or the label anchor (hollow) to reposition.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:border-emerald-300 hover:text-emerald-700"
                >
                  Reset to defaults
                </button>
                <button
                  type="button"
                  onClick={handleDownloadLayout}
                  className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:border-emerald-300 hover:text-emerald-700"
                >
                  Download layout
                </button>
                <button
                  type="button"
                  onClick={handleUploadDialogOpen}
                  className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 shadow-sm hover:border-emerald-400 hover:bg-emerald-50"
                >
                  Import layout
                </button>
                <button
                  type="button"
                  onClick={handleSaveAsDefault}
                  className="rounded-full border border-emerald-300 bg-emerald-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-200/80 hover:text-emerald-900"
                >
                  Save as new default
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isDirty}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide shadow-sm transition-colors ${
                    isDirty
                      ? "bg-emerald-500 text-white hover:bg-emerald-600"
                      : "bg-emerald-200 text-emerald-700 cursor-not-allowed"
                  }`}
                >
                  Save changes
                </button>
              </div>
              <p className="text-xs text-emerald-800/70 sm:text-right">
                Saved defaults live in this device&apos;s browser storage, so they persist across app updates and redeployments
                unless the local data is cleared.
              </p>
            </div>
          </div>

          {statusMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {statusMessage}
            </div>
          ) : null}

          <div className="relative mx-auto aspect-[3/5] w-full max-w-xl overflow-hidden rounded-[2.25rem] border border-emerald-100 bg-gradient-to-b from-emerald-50 via-white to-emerald-100 shadow-inner">
            {baseImage ? (
              <img
                src={baseImage}
                alt="Front anatomy silhouette"
                className="h-full w-full select-none object-contain"
                style={{ filter: "grayscale(1) saturate(0.7) brightness(1.05)" }}
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-emerald-500">
                Anatomy illustration unavailable
              </div>
            )}

            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {measurementFields.map(({ id, point, anchor }) => {
                const isActive = id === selectedFieldId;
                return (
                  <g key={id} className={isActive ? "opacity-100" : "opacity-40"}>
                    <line
                      x1={point.x}
                      y1={point.y}
                      x2={anchor.x}
                      y2={anchor.y}
                      stroke="#ef4444"
                      strokeWidth={isActive ? 1.8 : 1.2}
                      strokeLinecap="round"
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isActive ? 3.2 : 2.6}
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth={1}
                      style={{ cursor: isActive ? "grab" : "default" }}
                      onPointerDown={isActive ? handleDragStart(id, "point") : undefined}
                    />
                    <circle
                      cx={anchor.x}
                      cy={anchor.y}
                      r={isActive ? 2.6 : 2}
                      fill="#fca5a5"
                      stroke="#ffffff"
                      strokeWidth={0.8}
                      style={{ cursor: isActive ? "grab" : "default" }}
                      onPointerDown={isActive ? handleDragStart(id, "anchor") : undefined}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="grid gap-4 rounded-2xl border border-emerald-100 bg-white/90 p-4">
            <div className="grid grid-cols-2 items-center gap-3 text-sm text-emerald-800/80">
              <span className="font-semibold text-emerald-900">Active area</span>
              <span>{selectedField?.label}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {["point", "anchor"].map((target) => (
                <div key={target} className="space-y-2 rounded-xl border border-emerald-100 bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                    {target === "point" ? "Origin point" : "Label anchor"}
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {["x", "y"].map((axis) => (
                      <label key={axis} className="space-y-1">
                        <span className="text-xs font-medium uppercase tracking-widest text-emerald-700">{axis.toUpperCase()}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={Number.parseFloat(
                            positions[selectedField.id]?.[target]?.[axis] ?? selectedField[target][axis]
                          ).toFixed(1)}
                          onChange={handleManualChange(selectedField.id, target, axis)}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {isUploadDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/40 px-4 py-6">
          <div className="w-full max-w-lg space-y-5 rounded-3xl border border-emerald-100 bg-white p-6 shadow-xl shadow-emerald-900/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-emerald-900">Import layout from JSON</h2>
                <p className="mt-1 text-sm text-emerald-800/80">
                  Upload a layout file that was previously exported from this admin screen to instantly apply it for this device.
                </p>
              </div>
              <button
                type="button"
                onClick={handleUploadDialogClose}
                className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 hover:border-emerald-300 hover:text-emerald-800"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-800">
              <p>Select a JSON file that matches the exported layout format.</p>
              <input
                type="file"
                accept="application/json"
                onChange={handleLayoutFileSelection}
                className="w-full text-sm text-emerald-800"
              />
              {uploadFeedback.message ? (
                <p
                  className={`text-xs font-semibold ${
                    uploadFeedback.type === "error" ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {uploadFeedback.message}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
