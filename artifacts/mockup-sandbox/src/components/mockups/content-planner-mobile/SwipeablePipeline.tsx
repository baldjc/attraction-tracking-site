import React, { useState } from 'react';
import { format, addDays } from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Plus, 
  MoreHorizontal, 
  Calendar,
  MoreVertical,
  Filter
} from 'lucide-react';
import './_group.css';

type Status = "Idea" | "Scripted" | "Ready to Shoot" | "Filmed" | "Editing" | "Scheduled" | "Published";

interface PlanItem {
  id: string;
  title: string;
  status: Status;
  theme?: string;
  priority?: "High" | "Medium" | "Low";
  shootDate?: Date;
  publishDate?: Date;
  editDueDate?: Date;
}

const statuses: Status[] = [
  "Idea", "Scripted", "Ready to Shoot", "Filmed", "Editing", "Scheduled", "Published"
];

const today = new Date();

const seedData: PlanItem[] = [
  {
    id: "1",
    title: "First-time buyer mistakes in Calgary",
    status: "Idea",
    theme: "Buyer Tips",
    priority: "High",
  },
  {
    id: "2",
    title: "October Calgary market snapshot",
    status: "Scripted",
    theme: "Market Update",
    priority: "High",
    shootDate: addDays(today, 2),
  },
  {
    id: "3",
    title: "Walking through 142 Elbow Park",
    status: "Ready to Shoot",
    theme: "Listing Walkthrough",
    shootDate: addDays(today, 1),
  },
  {
    id: "4",
    title: "How to stage your home for winter",
    status: "Ready to Shoot",
    theme: "Seller FAQ",
    shootDate: addDays(today, 4),
  },
  {
    id: "5",
    title: "Top 5 coffee shops in Kensington",
    status: "Filmed",
    theme: "Neighbourhood Spotlight",
    editDueDate: addDays(today, 5),
  },
  {
    id: "6",
    title: "Hidden costs of buying a condo",
    status: "Editing",
    theme: "Buyer Tips",
    priority: "Medium",
    editDueDate: addDays(today, 1),
  },
  {
    id: "7",
    title: "Why I moved to Calgary",
    status: "Editing",
    theme: "Neighbourhood Spotlight",
    editDueDate: addDays(today, 3),
  },
  {
    id: "8",
    title: "Interest rates are dropping - now what?",
    status: "Scheduled",
    theme: "Market Update",
    priority: "High",
    publishDate: addDays(today, 7),
  },
  {
    id: "9",
    title: "A day in the life of a Calgary Realtor",
    status: "Published",
    theme: "Neighbourhood Spotlight",
    publishDate: addDays(today, -2),
  },
  {
    id: "10",
    title: "Seller FAQ: Should I renovate before selling?",
    status: "Idea",
    theme: "Seller FAQ",
  }
];

const getStatusColor = (status: Status) => {
  switch (status) {
    case "Idea": return { bg: "var(--st-idea-bg)", text: "var(--st-idea-text)" };
    case "Scripted": return { bg: "var(--st-scripted-bg)", text: "var(--st-scripted-text)" };
    case "Ready to Shoot": return { bg: "var(--st-ready-bg)", text: "var(--st-ready-text)" };
    case "Filmed": return { bg: "var(--st-shooting-bg)", text: "var(--st-shooting-text)" };
    case "Editing": return { bg: "var(--st-editing-bg)", text: "var(--st-editing-text)" };
    case "Scheduled": return { bg: "var(--st-scheduled-bg)", text: "var(--st-scheduled-text)" };
    case "Published": return { bg: "var(--st-published-bg)", text: "var(--st-published-text)" };
  }
};

export function SwipeablePipeline() {
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
  const currentStatus = statuses[currentStatusIndex];

  const handlePrev = () => {
    setCurrentStatusIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentStatusIndex((prev) => Math.min(statuses.length - 1, prev + 1));
  };

  const itemsInCurrentStatus = seedData.filter(item => item.status === currentStatus);
  const statusColors = getStatusColor(currentStatus);

  const getRelevantDate = (item: PlanItem) => {
    if (["Idea", "Scripted", "Ready to Shoot"].includes(item.status) && item.shootDate) {
      return { label: "Shoot", date: item.shootDate };
    }
    if (["Filmed", "Editing"].includes(item.status) && item.editDueDate) {
      return { label: "Edit due", date: item.editDueDate };
    }
    if (["Scheduled", "Published"].includes(item.status) && item.publishDate) {
      return { label: "Publish", date: item.publishDate };
    }
    return null;
  };

  return (
    <div className="flex justify-center bg-gray-100 min-h-screen font-sans text-gray-900">
      <div className="w-[390px] h-[844px] bg-gray-50 flex flex-col relative overflow-hidden shadow-2xl">
        
        {/* Header / Top Navigation */}
        <div className="px-4 pt-12 pb-4 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Content Planner</h1>
            <div className="flex gap-2">
              <button className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600">
                <Search size={20} />
              </button>
            </div>
          </div>

          {/* Swipeable Header */}
          <div className="flex items-center justify-between">
            <button 
              onClick={handlePrev}
              disabled={currentStatusIndex === 0}
              className={`p-2 rounded-full transition-colors ${currentStatusIndex === 0 ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <ChevronLeft size={24} />
            </button>

            <div className="flex flex-col items-center cursor-pointer group">
              <div 
                className="px-3 py-1 rounded-full text-sm font-medium mb-1 transition-transform group-active:scale-95 flex items-center gap-2"
                style={{ backgroundColor: statusColors.bg, color: statusColors.text }}
              >
                {currentStatus}
                <span className="bg-white/40 px-1.5 py-0.5 rounded-full text-xs font-bold mix-blend-multiply">
                  {itemsInCurrentStatus.length}
                </span>
              </div>
              <div className="flex gap-1">
                {statuses.map((_, idx) => (
                  <div 
                    key={idx} 
                    className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentStatusIndex ? 'w-4' : 'w-1.5 opacity-30'}`}
                    style={{ backgroundColor: idx === currentStatusIndex ? statusColors.text : '#cbd5e1' }}
                  />
                ))}
              </div>
            </div>

            <button 
              onClick={handleNext}
              disabled={currentStatusIndex === statuses.length - 1}
              className={`p-2 rounded-full transition-colors ${currentStatusIndex === statuses.length - 1 ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>

        {/* Swipeable Lane Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6 pb-24">
          {itemsInCurrentStatus.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Calendar size={24} className="text-gray-400" />
              </div>
              <p>No videos in {currentStatus}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {itemsInCurrentStatus.map((item) => {
                const relevantDate = getRelevantDate(item);
                const isLate = relevantDate?.date && relevantDate.date < today && item.status !== "Published";

                return (
                  <div 
                    key={item.id}
                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3 active:scale-[0.98] transition-transform cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-gray-900 leading-snug">
                        {item.title || "Untitled"}
                      </h3>
                      <button className="text-gray-400 hover:text-gray-600 -mr-1 -mt-1 p-1">
                        <MoreVertical size={18} />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.theme && (
                        <span className="px-2 py-1 rounded-md bg-gray-100 text-gray-600 text-xs font-medium">
                          {item.theme}
                        </span>
                      )}
                      {item.priority === "High" && (
                        <span className="px-2 py-1 rounded-md bg-red-50 text-red-700 text-xs font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                          High Priority
                        </span>
                      )}
                    </div>

                    {relevantDate && (
                      <div className={`flex items-center gap-1.5 text-xs font-medium pt-2 border-t border-gray-50 mt-1
                        ${isLate ? 'text-red-600' : 'text-gray-500'}`}
                      >
                        <Calendar size={14} />
                        <span>{relevantDate.label}: {format(relevantDate.date, 'MMM d')}</span>
                        {isLate && <span className="text-red-600 font-bold ml-1">Overdue</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Toolbar */}
        <div className="absolute bottom-0 w-full bg-white border-t border-gray-200 px-4 py-3 pb-8 flex items-center justify-between">
          <button className="flex flex-col items-center gap-1 text-[#7c5fde] min-w-[64px]">
            <Filter size={24} />
            <span className="text-[10px] font-medium">Filter</span>
          </button>
          
          <button className="h-14 px-6 rounded-full bg-[#6ba3c7] text-white font-bold flex items-center gap-2 shadow-lg shadow-[#6ba3c7]/30 transform -translate-y-4 active:scale-95 transition-transform">
            <Plus size={20} />
            <span>Add Video</span>
          </button>

          <button className="flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 min-w-[64px]">
            <MoreHorizontal size={24} />
            <span className="text-[10px] font-medium">Views</span>
          </button>
        </div>

      </div>
    </div>
  );
}
