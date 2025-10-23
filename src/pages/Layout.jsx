import { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Camera, BarChart3, History, Leaf, ClipboardList, Dumbbell, Ruler, Settings2, Brain, LogOut } from 'lucide-react';
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '@/constants/app';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import PWAControls from '@/components/PWAControls.jsx';
import { useAuth } from '@/context/AuthContext.jsx';

const BASE_NAVIGATION_ITEMS = [
  {
    title: 'Dashboard',
    url: createPageUrl('Dashboard'),
    icon: BarChart3,
  },
  {
    title: 'Upload Meal',
    url: createPageUrl('Upload'),
    icon: Camera,
  },
  {
    title: 'Meal History',
    url: createPageUrl('History'),
    icon: History,
  },
  {
    title: 'Diet Plans',
    url: createPageUrl('Diet Plans'),
    icon: ClipboardList,
  },
  {
    title: 'Workout Planner',
    url: createPageUrl('Workout Planner'),
    icon: Dumbbell,
  },
  {
    title: 'Body Measurements',
    url: createPageUrl('Body Measurements'),
    icon: Ruler,
  },
  {
    title: 'Measurement Intelligence',
    url: createPageUrl('Measurement Intelligence'),
    icon: Brain,
  },
];

const ADMIN_NAV_ITEM = {
  title: 'Body Measurements Admin',
  url: createPageUrl('Body Measurements Admin'),
  icon: Settings2,
};

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const { user, logout } = useAuth();

  const navigationItems = useMemo(() => {
    if (user?.role === 'admin') {
      return [...BASE_NAVIGATION_ITEMS, ADMIN_NAV_ITEM];
    }
    return BASE_NAVIGATION_ITEMS;
  }, [user?.role]);

  useEffect(() => {
    const pageTitle = currentPageName ? `${APP_NAME} | ${currentPageName}` : APP_NAME;
    document.title = pageTitle;

    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
      descriptionMeta.setAttribute('content', APP_DESCRIPTION);
    }
  }, [currentPageName]);

  return (
    <SidebarProvider>
      <style>{`
        :root {
          --primary-green: #10b981;
          --light-green: #d1fae5;
          --accent-green: #065f46;
          --warm-gray: #f9fafb;
          --text-primary: #111827;
          --text-secondary: #6b7280;
        }
      `}</style>
      <div className="min-h-screen flex w-full bg-gray-50">
        <Sidebar className="border-r border-gray-100 bg-white">
          <SidebarHeader className="border-b border-gray-100 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
                <Leaf className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-lg">{APP_NAME}</h2>
                <p className="text-xs text-gray-500 font-medium">{APP_TAGLINE}</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-2">
                  {navigationItems.map((item) => {
                    const normalizedPathname = location.pathname.toLowerCase();
                    const normalizedTarget = item.url.toLowerCase();
                    const isActive =
                      normalizedPathname === normalizedTarget ||
                      normalizedPathname.startsWith(`${normalizedTarget}/`);

                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className={`hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-300 rounded-xl h-12 ${
                            isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : ''
                          }`}
                        >
                          <Link to={item.url} className="flex items-center gap-4 px-4 py-3">
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-gray-100 p-6 space-y-3">
            <PWAControls />
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-xl border border-emerald-100">
              <h3 className="font-semibold text-emerald-800 text-sm mb-1">Stay Healthy!</h3>
              <p className="text-emerald-600 text-xs leading-relaxed">{APP_DESCRIPTION}</p>
            </div>
            {user && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-white/80 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">{user.displayName || user.username}</p>
                  <p className="text-xs uppercase tracking-wide text-emerald-700/70">{user.role}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50"
                  onClick={logout}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="sr-only">Sign out</span>
                </Button>
              </div>
            )}
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col">
          <header className="bg-white border-b border-gray-100 px-6 py-4 md:hidden">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="hover:bg-gray-100 p-2 rounded-lg transition-colors duration-200" />
                <h1 className="text-xl font-semibold text-gray-900">{APP_NAME}</h1>
              </div>
              {user && (
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{user.displayName || user.username}</p>
                  <p className="text-xs uppercase tracking-wide text-emerald-600/80">{user.role}</p>
                </div>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-auto bg-gray-50">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
