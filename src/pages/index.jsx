import { useState } from 'react';
import PropTypes from 'prop-types';
import Layout from './Layout.jsx';
import Dashboard from './Dashboard';
import Upload from './Upload';
import History from './History';
import EditMeal from './EditMeal';
import DietPlans from './DietPlans';
import WorkoutPlanner from './WorkoutPlanner.jsx';
import BodyMeasurements from './BodyMeasurements.jsx';
import BodyMeasurementsAdmin from './BodyMeasurementsAdmin.jsx';
import MeasurementAnalytics from './MeasurementAnalytics.jsx';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext.jsx';

const PAGES = {

    Dashboard: Dashboard,

    Upload: Upload,

    History: History,

    "Diet Plans": DietPlans,
    "Workout Planner": WorkoutPlanner,
    "Body Measurements": BodyMeasurements,
    "Measurement Intelligence": MeasurementAnalytics,
    "Body Measurements Admin": BodyMeasurementsAdmin,

}

function _getCurrentPage(url) {
    if (!url) {
        return Object.keys(PAGES)[0];
    }

    const normalizedUrl = url.toLowerCase();
    const exactMatch = Object.keys(PAGES).find(page => normalizedUrl.endsWith(`/${page.toLowerCase()}`));
    if (exactMatch) {
        return exactMatch;
    }

    const partialMatch = Object.keys(PAGES).find(page => normalizedUrl.includes(`/${page.toLowerCase()}`));
    return partialMatch || Object.keys(PAGES)[0];
}

function AuthScreen() {
    const { login, register, loading } = useAuth();
    const [mode, setMode] = useState('login');
    const [form, setForm] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setMessage('');

        const action = mode === 'login' ? login : register;

        try {
            const user = await action({ username: form.username.trim(), password: form.password });
            if (mode === 'register') {
                setMessage(`Welcome ${user.username}! Your account was created.`);
            }
        } catch (err) {
            const status = err?.status;
            if (status === 401 || status === 400) {
                setError('Invalid credentials. Please check your username and password.');
            } else if (status === 409) {
                setError('That username is already registered. Try signing in instead.');
            } else {
                setError(err?.message || 'Unable to process your request right now.');
            }
        }
    };

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((previous) => ({ ...previous, [name]: value }));
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-emerald-900/10 px-4 py-12">
            <div className="w-full max-w-md space-y-6 rounded-3xl border border-emerald-200/60 bg-white/95 p-8 shadow-xl shadow-emerald-900/10">
                <header className="space-y-2 text-center">
                    <h1 className="text-3xl font-bold text-emerald-900">Nutri Scan</h1>
                    <p className="text-sm text-emerald-800/80">
                        Sign in with your account to access meal tracking, analytics, and personalised insights.
                    </p>
                </header>

                <div className="flex gap-2 rounded-xl bg-emerald-50 p-1">
                    <button
                        type="button"
                        onClick={() => setMode('login')}
                        className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                            mode === 'login'
                                ? 'bg-white text-emerald-700 shadow'
                                : 'text-emerald-600 hover:text-emerald-700'
                        }`}
                    >
                        Sign in
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('register')}
                        className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                            mode === 'register'
                                ? 'bg-white text-emerald-700 shadow'
                                : 'text-emerald-600 hover:text-emerald-700'
                        }`}
                    >
                        Create account
                    </button>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-emerald-900" htmlFor="username">
                            Username
                        </label>
                        <input
                            id="username"
                            name="username"
                            value={form.username}
                            onChange={handleChange}
                            required
                            autoComplete="username"
                            className="w-full rounded-xl border border-emerald-200/80 px-3 py-2 text-sm text-emerald-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-emerald-900" htmlFor="password">
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            value={form.password}
                            onChange={handleChange}
                            required
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                            className="w-full rounded-xl border border-emerald-200/80 px-3 py-2 text-sm text-emerald-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        />
                    </div>

                    {error ? (
                        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                            {error}
                        </p>
                    ) : null}

                    {message ? (
                        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                            {message}
                        </p>
                    ) : null}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
                    >
                        {loading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Register'}
                    </button>
                </form>

                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-800/80">
                    <p className="font-semibold">Sample accounts</p>
                    <p>Standard user: <code className="font-mono">sample_user / sampleUser234!@</code></p>
                    <p>Admin user: <code className="font-mono">admin / sampleAdmin234!@</code></p>
                </div>
            </div>
        </div>
    );
}

function RequireAuth({ children }) {
    const { user, initializing } = useAuth();

    if (initializing) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-emerald-900/5">
                <div className="rounded-3xl border border-emerald-200/80 bg-white/90 px-6 py-4 text-sm font-semibold text-emerald-700 shadow">
                    Checking your session…
                </div>
            </div>
        );
    }

    if (!user) {
        return <AuthScreen />;
    }

    return children;
}

function RequireAdmin({ children }) {
    const { user } = useAuth();
    if (user?.role !== 'admin') {
        return (
            <div className="p-6">
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-semibold text-amber-700">
                    You need admin access to view this page.
                </div>
            </div>
        );
    }
    return children;
}

RequireAuth.propTypes = {
    children: PropTypes.node.isRequired,
};

RequireAdmin.propTypes = {
    children: PropTypes.node.isRequired,
};

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);

    return (
        <RequireAuth>
            <Layout currentPageName={currentPage}>
                <Routes>
                        <Route path="/" element={<Dashboard />} />
                    <Route path="/Dashboard" element={<Dashboard />} />
                    <Route path="/Upload" element={<Upload />} />
                    <Route path="/History" element={<History />} />
                    <Route path="/History/:mealId" element={<EditMeal />} />
                    <Route path="/Diet-Plans" element={<DietPlans />} />
                    <Route path="/Workout-Planner" element={<WorkoutPlanner />} />
                    <Route path="/Body-Measurements" element={<BodyMeasurements />} />
                    <Route path="/Measurement-Intelligence" element={<MeasurementAnalytics />} />
                    <Route
                        path="/Body-Measurements-Admin"
                        element={(
                            <RequireAdmin>
                                <BodyMeasurementsAdmin />
                            </RequireAdmin>
                        )}
                    />
                </Routes>
            </Layout>
        </RequireAuth>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}
