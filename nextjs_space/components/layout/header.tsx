'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Database,
  LayoutDashboard,
  Server,
  LogOut,
  User,
  Moon,
  Sun,
  Menu,
  X,
  FolderKanban,
  Brain,
  Sparkles,
  Lightbulb,
  MessageSquare,
  FileText,
  ChevronDown,
  TestTube2,
  Shield,
  Telescope,
  Users,
  Network,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';

export function Header() {
  const { data: session } = useSession() || {};
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!session?.user) return null;

  const isAdmin = session.user?.role === 'ADMIN' || session.user?.role === 'OWNER';

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Projects', href: '/projects', icon: FolderKanban },
    { name: 'Clusters', href: '/clusters', icon: Server },
  ];

  const adminNavigation = [
    { name: 'User Management', href: '/admin/users', icon: Users, description: 'Manage users & MFA' },
    { name: 'Federation', href: '/admin/federation', icon: Network, description: 'Control Plane Clustering' },
  ];

  const aiNavigation = [
    { name: 'AI Insights', href: '/ai/insights', icon: Sparkles, description: 'Anomalies & Forecasts' },
    { name: 'Recommendations', href: '/ai/recommendations', icon: Lightbulb, description: 'AI Recommendations' },
    { name: 'ChatOps', href: '/ai/chat', icon: MessageSquare, description: 'AI Assistant' },
    { name: 'Reports', href: '/ai/reports', icon: FileText, description: 'Generate Reports' },
    { name: 'QA Copilot', href: '/ai/qa', icon: TestTube2, description: 'Test Generation' },
    { name: 'Governance', href: '/ai/governance', icon: Shield, description: 'Compliance & FinOps' },
    { name: 'Tech Scout', href: '/ai/tech-scout', icon: Telescope, description: 'Version & Trends' },
  ];

  const isAiActive = pathname?.startsWith('/ai');

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Database className="h-8 w-8 text-cyan-500" />
            <span className="text-xl font-bold text-slate-100">PG Control Plane</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname?.startsWith(item.href);
              return (
                <Link key={item.name} href={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={isActive ? 'bg-slate-700' : ''}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.name}
                  </Button>
                </Link>
              );
            })}
            
            {/* AI Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={isAiActive ? 'secondary' : 'ghost'}
                  className={isAiActive ? 'bg-slate-700' : ''}
                >
                  <Brain className="mr-2 h-4 w-4 text-cyan-400" />
                  AI
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 bg-slate-800 border-slate-700">
                {aiNavigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.name} asChild>
                      <Link href={item.href} className="flex items-center gap-3 cursor-pointer">
                        <Icon className="h-4 w-4 text-cyan-400" />
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-slate-400">{item.description}</div>
                        </div>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Admin Dropdown */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={pathname?.startsWith('/admin') ? 'secondary' : 'ghost'}
                    className={pathname?.startsWith('/admin') ? 'bg-slate-700' : ''}
                  >
                    <Shield className="mr-2 h-4 w-4 text-amber-400" />
                    Admin
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-slate-800 border-slate-700">
                  {adminNavigation.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.name} asChild>
                        <Link href={item.href} className="flex items-center gap-3 cursor-pointer">
                          <Icon className="h-4 w-4 text-amber-400" />
                          <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-slate-400">{item.description}</div>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {mounted && (
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === 'dark' ? (
                <Sun className="h-5 w-5 text-slate-300" />
              ) : (
                <Moon className="h-5 w-5 text-slate-300" />
              )}
            </Button>
          )}

          <div className="hidden md:flex items-center gap-3 border-l border-slate-700 pl-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-300">{session.user?.email}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-600/20 text-cyan-400">
                {session.user?.role}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/login' })}>
              <LogOut className="h-4 w-4 mr-1" />
              Sign out
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-700">
          <div className="px-4 py-3 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname?.startsWith(item.href);
              return (
                <Link key={item.name} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className="w-full justify-start"
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.name}
                  </Button>
                </Link>
              );
            })}
            
            {/* AI Section */}
            <div className="pt-2 border-t border-slate-700">
              <p className="px-4 py-2 text-xs font-medium text-slate-500 uppercase">AI Features</p>
              {aiNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link key={item.name} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                    <Button
                      variant={isActive ? 'secondary' : 'ghost'}
                      className="w-full justify-start"
                    >
                      <Icon className="mr-2 h-4 w-4 text-cyan-400" />
                      {item.name}
                    </Button>
                  </Link>
                );
              })}
            </div>
            
            <div className="pt-2 border-t border-slate-700">
              <div className="flex items-center gap-2 px-4 py-2">
                <User className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-300">{session.user?.email}</span>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start text-red-400"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
