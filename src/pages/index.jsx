import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";

import Upload from "./Upload";

import History from "./History";
import EditMeal from "./EditMeal";
import DietPlans from "./DietPlans";
import WorkoutPlanner from "./WorkoutPlanner.jsx";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {

    Dashboard: Dashboard,

    Upload: Upload,

    History: History,

    "Diet Plans": DietPlans,
    "Workout Planner": WorkoutPlanner,

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

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);

    return (
        <Layout currentPageName={currentPage}>
            <Routes>

                    <Route path="/" element={<Dashboard />} />


                <Route path="/Dashboard" element={<Dashboard />} />

                <Route path="/Upload" element={<Upload />} />

                <Route path="/History" element={<History />} />

                <Route path="/History/:mealId" element={<EditMeal />} />

                <Route path="/Diet-Plans" element={<DietPlans />} />
                <Route path="/Workout-Planner" element={<WorkoutPlanner />} />
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}
