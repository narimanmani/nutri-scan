import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";

import Upload from "./Upload";

import History from "./History";
import EditMeal from "./EditMeal";
import DietPlans from "./DietPlans";
import WorkoutPlanner from "./WorkoutPlanner.jsx";
import BodyMeasurements from "./BodyMeasurements.jsx";
import BodyMeasurementsAdmin from "./BodyMeasurementsAdmin.jsx";
import MeasurementAnalytics from "./MeasurementAnalytics.jsx";
import LoginPage from "./Login.jsx";
import RegisterPage from "./Register.jsx";

import { BrowserRouter as Router, Route, Routes, useLocation, Navigate, Outlet } from 'react-router-dom';
import useAuth from "@/hooks/useAuth";

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

function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center text-emerald-700">
                Loading your workspace...
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    return children;
}

function RequireAdmin({ children }) {
    const { user } = useAuth();
    if (user?.role !== 'admin') {
        return <Navigate to="/" replace />;
    }
    return children;
}

function ProtectedLayout() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);

    return (
        <RequireAuth>
            <Layout currentPageName={currentPage}>
                <Outlet />
            </Layout>
        </RequireAuth>
    );
}

export default function Pages() {
    return (
        <Router>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route element={<ProtectedLayout />}>
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
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}
