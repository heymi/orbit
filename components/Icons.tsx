import React from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  HelpCircle, 
  AlertCircle, 
  AlertOctagon,
  MoreHorizontal,
  Plus,
  Search,
  Sidebar,
  User as UserIcon,
  Code,
  PenTool,
  Megaphone,
  Inbox,
  Layers,
  Sparkles,
  X,
  XCircle,
  ChevronRight,
  Filter,
  ArrowUp,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Minus,
  Trash2,
  Calendar,
  ListTodo,
  GripVertical,
  LayoutList,
  LayoutGrid,
  List,
  ArrowDownWideNarrow,
  MoreVertical,
  Sun,
  Moon,
  Monitor,
  Archive,
  CalendarRange,
  Repeat,
  Eye,
  Beaker,
  GitMerge,
  Copy,
  Terminal,
  GitBranch,
  Check,
  Users,
  Settings,
  Mail,
  Edit3,
  Rocket,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Folder,
  Globe,
  Box,
  Target,
  Zap,
  Cpu,
  Smartphone,
  Layout,
  Flag,
  BarChart3,
  AlertTriangle,
  LogOut,
  MessageSquare,
  Hash,
  Send,
  Loader2
} from 'lucide-react';
import { Priority, Status } from '../types';

export const PriorityIcon = ({ priority }: { priority: Priority }) => {
  switch (priority) {
    case Priority.Urgent:
      return <AlertOctagon className="w-4 h-4 text-red-500" />;
    case Priority.High:
      return <SignalHigh className="w-4 h-4 text-orange-500" />;
    case Priority.Medium:
      return <SignalMedium className="w-4 h-4 text-yellow-500" />;
    case Priority.Low:
      return <SignalLow className="w-4 h-4 text-muted" />;
    case Priority.NoPriority:
    default:
      return <Minus className="w-4 h-4 text-muted" />;
  }
};

export const StatusIcon = ({ status }: { status: Status }) => {
  switch (status) {
    case Status.Done:
      return <CheckCircle2 className="w-4 h-4 text-indigo-500" />;
    case Status.InProgress:
      return <div className="w-4 h-4 rounded-full border-2 border-yellow-500 border-r-transparent animate-spin-slow" style={{ animationDuration: '3s' }} />;
    case Status.CodeMerged:
      return <GitMerge className="w-4 h-4 text-purple-500" />;
    case Status.InQA:
      return <Beaker className="w-4 h-4 text-pink-500" />;
    case Status.Todo:
      return <Circle className="w-4 h-4 text-muted" />;
    case Status.Backlog:
      return <div className="w-4 h-4 rounded-full border border-dashed border-muted" />;
    case Status.Canceled:
      return <X className="w-4 h-4 text-muted" />;
    case Status.Closed:
      return <Archive className="w-4 h-4 text-muted" />;
    default:
      return <Circle className="w-4 h-4 text-muted" />;
    }
};

export const TeamIcon = ({ name }: { name: string }) => {
  if (name.includes('业务') || name.includes('Inbox')) return <Inbox className="w-4 h-4 text-indigo-500" />;
  if (name.includes('研发') || name.includes('Eng')) return <Zap className="w-4 h-4 text-yellow-500" />;
  return <Layers className="w-4 h-4" />;
};

export const ProjectIcon = ({ icon, className }: { icon?: string, className?: string }) => {
    // If it's a legacy icon name, map it (optional, but good for safety), else return emoji
    const cls = className || "w-4 h-4";
    // For this update, we assume `icon` is an emoji string
    return <span className={`flex items-center justify-center ${cls} not-italic leading-none font-normal select-none`}>{icon || '📁'}</span>
}

export {
  Plus, Search, Sidebar, UserIcon, Inbox, Layers, Sparkles, X, 
  ChevronRight, Filter, MoreHorizontal, CheckCircle2,
  Trash2, Calendar, ListTodo, GripVertical, LayoutList,
  LayoutGrid, List,
  ArrowDownWideNarrow, MoreVertical,
  Sun, Moon, Monitor, Archive, CalendarRange, Repeat,
  Eye, Beaker, GitMerge, Copy, Terminal, GitBranch, Check,
  Users, Settings, Mail, Edit3, Rocket, ChevronDown, ChevronUp,
  Briefcase, Folder, Globe, Box, Target, Zap, Cpu, Smartphone, Layout, Flag,
  AlertCircle, XCircle, BarChart3, Clock, AlertTriangle, LogOut,
  MessageSquare, Hash, Send, Loader2
};