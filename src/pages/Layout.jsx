
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Camera, BarChart3, History, Leaf } from "lucide-react";
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
} from "@/components/ui/sidebar";

const navigationItems = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: BarChart3,
  },
  {
    title: "Upload Meal",
    url: createPageUrl("Upload"),
    icon: Camera,
  },
  {
    title: "Meal History",
    url: createPageUrl("History"),
    icon: History,
  },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();

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
                <h2 className="font-bold text-gray-900 text-lg">NutriTracker</h2>
                <p className="text-xs text-gray-500 font-medium">AI Meal Analysis</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-2">
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        className={`hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-300 rounded-xl h-12 ${
                          location.pathname.toLowerCase().startsWith(item.url.toLowerCase())
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : ''
                        }`}
                      >
                        <Link to={item.url} className="flex items-center gap-4 px-4 py-3">
                          <item.icon className="w-5 h-5" />
                          <span className="font-medium">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-gray-100 p-6">
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-xl border border-emerald-100">
              <h3 className="font-semibold text-emerald-800 text-sm mb-1">Stay Healthy!</h3>
              <p className="text-emerald-600 text-xs leading-relaxed">
                Track your nutrition and reach your wellness goals with AI-powered insights.
              </p>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col">
          <header className="bg-white border-b border-gray-100 px-6 py-4 md:hidden">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-gray-100 p-2 rounded-lg transition-colors duration-200" />
              <h1 className="text-xl font-semibold text-gray-900">NutriTracker</h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto bg-gray-50">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
