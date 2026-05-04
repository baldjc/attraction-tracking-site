import React, { useState, useMemo } from 'react';
import { format, isSameDay, isSameMonth, addDays, startOfWeek, startOfMonth, endOfMonth, endOfWeek, parseISO, isToday, isBefore } from 'date-fns';
import { ChevronLeft, ChevronRight, Search, Plus, Calendar as CalendarIcon, Filter, X } from 'lucide-react';
import './_group.css';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

// --- Types ---
type Status = "Idea" | "Scripted" | "Ready to Shoot" | "Filmed" | "Editing" | "Scheduled" | "Published";

interface PlanItem {
  id: string;
  title: string;
  status: Status;
  theme?: string;
  priority?: "High" | "Medium" | "Low";
  shootDate: Date | null;
  publishDate: Date | null;
  editDueDate: Date | null;
}

// --- Data ---
const SEED_DATA: PlanItem[] = [
  {
    id: "1",
    title: "First-time buyer mistakes in Calgary",
    status: "Idea",
    theme: "Buyer Tips",
    shootDate: addDays(new Date(), 5),
    publishDate: addDays(new Date(), 14),
    editDueDate: addDays(new Date(), 10),
  },
  {
    id: "2",
    title: "October Calgary market snapshot",
    status: "Scripted",
    theme: "Market Update",
    shootDate: addDays(new Date(), 2),
    publishDate: addDays(new Date(), 8),
    editDueDate: addDays(new Date(), 6),
  },
  {
    id: "3",
    title: "Walking through 142 Elbow Park",
    status: "Filmed",
    theme: "Listing Walkthrough",
    shootDate: addDays(new Date(), -2),
    publishDate: addDays(new Date(), 3),
    editDueDate: addDays(new Date(), 1),
  },
  {
    id: "4",
    title: "Is now a good time to sell?",
    status: "Idea",
    theme: "Seller FAQ",
    shootDate: null,
    publishDate: addDays(new Date(), 20),
    editDueDate: null,
  },
  {
    id: "5",
    title: "Neighbourhood Spotlight: Inglewood",
    status: "Editing",
    theme: "Neighbourhood Spotlight",
    shootDate: addDays(new Date(), -5),
    publishDate: addDays(new Date(), 5),
    editDueDate: addDays(new Date(), 2),
  },
  {
    id: "6",
    title: "How to win a bidding war",
    status: "Ready to Shoot",
    theme: "Buyer Tips",
    shootDate: addDays(new Date(), 1),
    publishDate: addDays(new Date(), 10),
    editDueDate: addDays(new Date(), 8),
  },
  {
    id: "7",
    title: "Why home inspections are mandatory",
    status: "Published",
    theme: "Buyer Tips",
    shootDate: addDays(new Date(), -15),
    publishDate: addDays(new Date(), -2),
    editDueDate: addDays(new Date(), -5),
  },
  {
    id: "8",
    title: "Staging your home for top dollar",
    status: "Scheduled",
    theme: "Seller FAQ",
    shootDate: addDays(new Date(), -10),
    publishDate: addDays(new Date(), 1),
    editDueDate: addDays(new Date(), -2),
  },
];

const STATUS_COLORS: Record<Status, { bg: string; text: string }> = {
  "Idea": { bg: "var(--st-idea-bg)", text: "var(--st-idea-text)" },
  "Scripted": { bg: "var(--st-scripted-bg)", text: "var(--st-scripted-text)" },
  "Ready to Shoot": { bg: "var(--st-ready-bg)", text: "var(--st-ready-text)" },
  "Filmed": { bg: "var(--st-shooting-bg)", text: "var(--st-shooting-text)" },
  "Editing": { bg: "var(--st-editing-bg)", text: "var(--st-editing-text)" },
  "Scheduled": { bg: "var(--st-scheduled-bg)", text: "var(--st-scheduled-text)" },
  "Published": { bg: "var(--st-published-bg)", text: "var(--st-published-text)" },
};

type DateMode = "Publish dates" | "Shoot dates" | "Edit due";

export function CalendarFirst() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateMode, setDateMode] = useState<DateMode>("Publish dates");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "All">("All");
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const prevMonth = () => setCurrentDate(addDays(monthStart, -1));
  const nextMonth = () => setCurrentDate(addDays(monthEnd, 1));

  // Calendar days
  const calendarDays = useMemo(() => {
    const days = [];
    let day = startDate;
    while (day <= endDate) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [startDate, endDate]);

  // Get date for an item based on mode
  const getItemDate = (item: PlanItem) => {
    if (dateMode === "Publish dates") return item.publishDate;
    if (dateMode === "Shoot dates") return item.shootDate;
    return item.editDueDate;
  };

  // Filter items
  const filteredItems = useMemo(() => {
    return SEED_DATA.filter(item => {
      const matchSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === "All" || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [searchQuery, statusFilter]);

  // Get items for a specific date
  const getItemsForDate = (date: Date) => {
    return filteredItems.filter(item => {
      const itemDate = getItemDate(item);
      return itemDate && isSameDay(itemDate, date);
    });
  };

  // Items for selected day
  const selectedDayItems = getItemsForDate(selectedDate);
  
  // If no selected day items and today is selected, maybe show this week?
  // Let's just show selected day items, or upcoming if none.
  const upcomingItems = useMemo(() => {
    if (selectedDayItems.length > 0) return [];
    return filteredItems.filter(item => {
      const itemDate = getItemDate(item);
      return itemDate && !isBefore(itemDate, selectedDate);
    }).sort((a, b) => {
      const dA = getItemDate(a);
      const dB = getItemDate(b);
      return (dA?.getTime() || 0) - (dB?.getTime() || 0);
    }).slice(0, 3);
  }, [selectedDayItems, filteredItems, selectedDate, dateMode]);

  return (
    <div className="w-[390px] min-h-[844px] max-h-[844px] overflow-y-auto bg-gray-50 font-sans mx-auto relative shadow-xl flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-3 sticky top-0 z-10 flex items-center justify-between border-b border-gray-100">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Content</h1>
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <div className="flex items-center bg-gray-100 rounded-full px-3 py-1.5 animate-in fade-in slide-in-from-right-4">
              <Search className="w-4 h-4 text-gray-400 mr-2" />
              <input 
                autoFocus
                className="bg-transparent text-sm outline-none w-28 text-gray-800"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button onClick={() => {setSearchOpen(false); setSearchQuery('');}} className="p-1">
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          ) : (
            <button onClick={() => setSearchOpen(true)} className="p-2 text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
              <Search className="w-5 h-5" />
            </button>
          )}
          
          <Sheet>
            <SheetTrigger asChild>
              <button className="p-2 text-gray-600 rounded-full hover:bg-gray-100 transition-colors relative">
                <Filter className="w-5 h-5" />
                {statusFilter !== "All" && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#6ba3c7] rounded-full border-2 border-white"></span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="w-[390px] mx-auto rounded-t-2xl p-6 pb-12">
              <SheetHeader className="mb-6">
                <SheetTitle className="text-left">Filter by Status</SheetTitle>
              </SheetHeader>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => setStatusFilter("All")}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${statusFilter === "All" ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  All Statuses
                </button>
                {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status as Status)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${statusFilter === status ? 'ring-2 ring-offset-2 ring-gray-900' : ''}`}
                    style={{ backgroundColor: colors.bg, color: colors.text }}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Date Mode Toggle */}
      <div className="bg-white px-4 py-3">
        <div className="flex p-1 bg-gray-100 rounded-lg">
          {(["Publish dates", "Shoot dates", "Edit due"] as DateMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setDateMode(mode)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                dateMode === mode 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {mode.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white px-4 pb-4 rounded-b-2xl shadow-sm mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <div className="flex gap-1">
            <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days of week */}
        <div className="grid grid-cols-7 mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
            <div key={day} className="text-center text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-y-2 gap-x-1">
          {calendarDays.map((day, i) => {
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);
            const dayItems = getItemsForDate(day);
            
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(day)}
                className={`
                  flex flex-col items-center justify-start h-10 w-full rounded-lg py-1 relative
                  ${isSelected ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-900'}
                  ${!isCurrentMonth && !isSelected ? 'text-gray-300' : ''}
                `}
              >
                <span className={`text-sm ${isSelected ? 'font-semibold' : 'font-medium'} ${isTodayDate && !isSelected ? 'text-[#6ba3c7]' : ''}`}>
                  {format(day, 'd')}
                </span>
                
                {/* Dots indicator */}
                <div className="flex gap-0.5 mt-0.5 px-1 justify-center w-full">
                  {dayItems.slice(0, 3).map((item, idx) => (
                    <div 
                      key={idx} 
                      className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'border border-gray-900' : ''}`}
                      style={{ backgroundColor: STATUS_COLORS[item.status].bg }}
                    />
                  ))}
                  {dayItems.length > 3 && (
                    <div className="w-1 h-1 rounded-full bg-gray-400" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day View */}
      <div className="px-4 flex-1 pb-24">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, MMM d')}
            </h3>
            <p className="text-xs text-gray-500">
              {selectedDayItems.length} {selectedDayItems.length === 1 ? 'video' : 'videos'} {dateMode.toLowerCase()}
            </p>
          </div>
          <button className="flex items-center gap-1 text-[#7c5fde] text-sm font-medium bg-[#7c5fde]/10 px-3 py-1.5 rounded-full hover:bg-[#7c5fde]/20 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        <div className="space-y-3">
          {selectedDayItems.length > 0 ? (
            selectedDayItems.map(item => (
              <div key={item.id} className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2 relative active:scale-[0.98] transition-transform">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-medium text-sm text-gray-900 leading-snug line-clamp-2 pr-4">
                    {item.title || "Untitled Video"}
                  </h4>
                </div>
                
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span 
                    className="px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                    style={{ backgroundColor: STATUS_COLORS[item.status].bg, color: STATUS_COLORS[item.status].text }}
                  >
                    {item.status}
                  </span>
                  {item.theme && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium whitespace-nowrap">
                      {item.theme}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-transparent border border-dashed border-gray-300 rounded-xl p-6 text-center">
              <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Nothing for this date</p>
              
              {upcomingItems.length > 0 && (
                <div className="mt-6 text-left">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Upcoming</p>
                  <div className="space-y-2">
                    {upcomingItems.map(item => (
                      <button key={item.id} onClick={() => setSelectedDate(getItemDate(item) || selectedDate)} className="w-full text-left bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-medium text-[#7c5fde]">
                            {getItemDate(item) ? format(getItemDate(item)!, 'MMM d') : ''}
                          </span>
                          <span 
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{ backgroundColor: STATUS_COLORS[item.status].bg, color: STATUS_COLORS[item.status].text }}
                          >
                            {item.status}
                          </span>
                        </div>
                        <h4 className="font-medium text-xs text-gray-900 truncate">
                          {item.title}
                        </h4>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* FAB - Global Add */}
      <button className="absolute bottom-6 right-4 w-12 h-12 bg-[#6ba3c7] hover:bg-[#5a92b6] text-white rounded-full shadow-lg shadow-[#6ba3c7]/30 flex items-center justify-center transition-transform active:scale-95">
        <Plus className="w-6 h-6" />
      </button>

    </div>
  );
}
