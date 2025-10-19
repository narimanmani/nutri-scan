import { Route, Routes, useLocation, Navigate } from 'react-router-dom';
import Layout from './Layout.jsx';
import Dashboard from './Dashboard.jsx';
import Upload from './Upload.jsx';
import History from './History.jsx';
import EditMeal from './EditMeal.jsx';
import DietPlans from './DietPlans.jsx';
import WorkoutPlanner from './WorkoutPlanner.jsx';
import BodyMeasurements from './BodyMeasurements.jsx';
import BodyMeasurementsAdmin from './BodyMeasurementsAdmin.jsx';
import MeasurementAnalytics from './MeasurementAnalytics.jsx';

const PAGES = {
  Dashboard: Dashboard,
  Upload: Upload,
  History: History,
  'Diet Plans': DietPlans,
  'Workout Planner': WorkoutPlanner,
  'Body Measurements': BodyMeasurements,
  'Measurement Intelligence': MeasurementAnalytics,
  'Body Measurements Admin': BodyMeasurementsAdmin,
};

function getCurrentPage(url) {
  if (!url) {
    return Object.keys(PAGES)[0];
  }

  const normalizedUrl = url.toLowerCase();
  const exactMatch = Object.keys(PAGES).find((page) => normalizedUrl.endsWith(`/${page.toLowerCase()}`));
  if (exactMatch) {
    return exactMatch;
  }

  const partialMatch = Object.keys(PAGES).find((page) => normalizedUrl.includes(`/${page.toLowerCase()}`));
  return partialMatch || Object.keys(PAGES)[0];
}

export default function ProtectedRoutes() {
  const location = useLocation();
  const currentPage = getCurrentPage(location.pathname);

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
        <Route path="/Body-Measurements" element={<BodyMeasurements />} />
        <Route path="/Measurement-Intelligence" element={<MeasurementAnalytics />} />
        <Route path="/Body-Measurements-Admin" element={<BodyMeasurementsAdmin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
