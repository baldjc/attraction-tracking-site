import React, { useState } from 'react';
import { Search, Filter, Plus, Calendar, AlertCircle, PlaySquare, FileText, CheckCircle2, Video, Pencil, Clock, Upload, ChevronRight, X, Sparkles } from 'lucide-react';
import './_group.css';

interface PlanItem {
  id: string;
  title: string;
  status: string;
  theme?: string;
  priority?: "High" | "Medium" | "Low";
  shootDate?: Date | null;
  publishDate?: Date | null;
  editDueDate?: Date | null;
  notes?: string;
  script?: string;
  youtubeDescription?: string;
  researchNotes?: string;
  thumbnailWords?: string;
  footageLink?: string;
  driveFolderLink?: string;
}

const seedData: PlanItem[] = [
  {
    id: "1",
    title: "First-time buyer mistakes in Calgary",
    status: "Idea",
    theme: "Buyer Tips",
    priority: "High",
    notes: "Need to talk about the recent changes to the first-time home buyer incentive.",
  },
  {
    id: "2",
    title: "October Calgary market snapshot",
    status: "Scripted",
    theme: "Market Update",
    priority: "High",
    shootDate: new Date(2023, 9, 15),
    publishDate: new Date(2023, 9, 20),
    script: "Hook: The Calgary market is cooling down, but there's a catch...",
  },
  {
    id: "3",
    title: "Walking through 142 Elbow Park",
    status: "Ready to Shoot",
    theme: "Listing Walkthrough",
    shootDate: new Date(2023, 9, 18),
  },
  {
    id: "4",
    title: "How to stage your home for winter",
    status: "Filmed",
    theme: "Seller FAQ",
    priority: "Medium",
    editDueDate: new Date(2023, 9, 22),
    publishDate: new Date(2023, 9, 25),
  },
  {
    id: "5",
    title: "Neighbourhood Spotlight: Altadore",
    status: "Editing",
    theme: "Neighbourhood Spotlight",
    priority: "Low",
    editDueDate: new Date(2023, 9, 10),
    publishDate: new Date(2023, 9, 12),
  },
  {
    id: "6",
    title: "Interest rates are up again - what now?",
    status: "Scheduled",
    theme: "Market Update",
    priority: "High",
    publishDate: new Date(2023, 9, 5),
  },
  {
    id: "7",
    title: "5 signs a house has water damage",
    status: "Published",
    theme: "Buyer Tips",
    publishDate: new Date(2023, 8, 28),
  },
  {
    id: "8",
    title: "Should you buy a condo or a townhouse in 2024?",
    status: "Idea",
    theme: "Buyer Tips",
    priority: "Medium",
  },
  {
    id: "9",
    title: "Top 3 renovation mistakes to avoid",
    status: "Scripted",
    theme: "Seller FAQ",
    shootDate: new Date(2023, 10, 2),
  },
  {
    id: "10",
    title: "Walking through a $2M infill in Marda Loop",
    status: "Ready to Shoot",
    theme: "Listing Walkthrough",
    priority: "High",
    shootDate: new Date(2023, 9, 25),
  }
];

const getStatusColor = (status: string) => {
  switch (status) {
    case "Idea": return { bg: "var(--st-idea-bg)", text: "var(--st-idea-text)" };
    case "Scripted": return { bg: "var(--st-scripted-bg)", text: "var(--st-scripted-text)" };
    case "Ready to Shoot": return { bg: "var(--st-ready-bg)", text: "var(--st-ready-text)" };
    case "Filmed": return { bg: "var(--st-shooting-bg)", text: "var(--st-shooting-text)" };
    case "Editing": return { bg: "var(--st-editing-bg)", text: "var(--st-editing-text)" };
    case "Scheduled": return { bg: "var(--st-scheduled-bg)", text: "var(--st-scheduled-text)" };
    case "Published": return { bg: "var(--st-published-bg)", text: "var(--st-published-text)" };
    default: return { bg: "#eee", text: "#333" };
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "Idea": return <Sparkles className="w-3 h-3" />;
    case "Scripted": return <FileText className="w-3 h-3" />;
    case "Ready to Shoot": return <Video className="w-3 h-3" />;
    case "Filmed": return <CheckCircle2 className="w-3 h-3" />;
    case "Editing": return <Pencil className="w-3 h-3" />;
    case "Scheduled": return <Clock className="w-3 h-3" />;
    case "Published": return <Upload className="w-3 h-3" />;
    default: return <FileText className="w-3 h-3" />;
  }
};

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' }).format(date);
};

export function CardFeed() {
  const [items, setItems] = useState<PlanItem[]>(seedData);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (item.theme && item.theme.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-[390px] min-h-[844px] bg-[#F7F7F8] font-sans mx-auto relative overflow-hidden flex flex-col shadow-xl border border-gray-200 rounded-[40px]">
      
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 pt-12 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-gray-900">Planner</h1>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsSearchOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsFilterOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Filter className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 flex items-center justify-center rounded-full bg-[#6ba3c7] text-white hover:bg-[#5a92b6] transition-colors ml-1 shadow-sm">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Feed Content */}
      <main className="flex-1 overflow-y-auto pb-24 px-4 pt-4 space-y-4">
        {filteredItems.map((item) => {
          const statusColors = getStatusColor(item.status);
          
          let nextDateStr = "";
          let nextDateLabel = "";
          if (item.publishDate) { nextDateStr = formatDate(item.publishDate); nextDateLabel = "Publish"; }
          else if (item.shootDate) { nextDateStr = formatDate(item.shootDate); nextDateLabel = "Shoot"; }
          else if (item.editDueDate) { nextDateStr = formatDate(item.editDueDate); nextDateLabel = "Edit"; }

          return (
            <article 
              key={item.id} 
              className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 active:scale-[0.98] transition-transform cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div 
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: statusColors.bg, color: statusColors.text }}
                >
                  {getStatusIcon(item.status)}
                  {item.status}
                </div>
                {item.priority === "High" && (
                  <div className="flex items-center text-red-500 bg-red-50 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    High
                  </div>
                )}
              </div>
              
              <h2 className="text-lg font-semibold text-gray-900 leading-tight mb-3 pr-4">
                {item.title}
              </h2>
              
              <div className="flex items-center justify-between text-sm text-gray-500">
                <div className="flex items-center gap-3">
                  {item.theme && (
                    <span className="inline-flex items-center gap-1">
                      <PlaySquare className="w-4 h-4 text-gray-400" />
                      {item.theme}
                    </span>
                  )}
                  {nextDateStr && (
                    <span className="inline-flex items-center gap-1 text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-700">{nextDateStr}</span>
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </article>
          );
        })}
      </main>

      {/* Search Overlay */}
      {isSearchOpen && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="pt-12 px-4 pb-4 border-b border-gray-100 flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                autoFocus
                type="text" 
                placeholder="Search videos, themes..." 
                className="w-full bg-gray-100 rounded-xl py-2.5 pl-10 pr-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }}
              className="text-gray-500 font-medium text-sm px-2"
            >
              Cancel
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4">
            {searchQuery && filteredItems.length === 0 ? (
              <div className="text-center text-gray-500 mt-10">No videos found for "{searchQuery}"</div>
            ) : null}
          </div>
        </div>
      )}

      {/* Filter Bottom Sheet (Mock) */}
      {isFilterOpen && (
        <>
          <div 
            className="absolute inset-0 bg-black/20 z-40 animate-in fade-in"
            onClick={() => setIsFilterOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 p-6 pb-10 animate-in slide-in-from-bottom-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg">Filters</h3>
              <button 
                onClick={() => setIsFilterOpen(false)}
                className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Status</h4>
                <div className="flex flex-wrap gap-2">
                  {["Idea", "Scripted", "Ready to Shoot", "Filmed", "Editing", "Scheduled", "Published"].map(status => {
                    const colors = getStatusColor(status);
                    return (
                      <button 
                        key={status}
                        className="px-3 py-1.5 rounded-full text-sm font-medium border border-transparent"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        {status}
                      </button>
                    )
                  })}
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">View Mode</h4>
                <div className="flex flex-col gap-2">
                  <button className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl font-medium text-gray-900 border border-gray-200">
                    Card Feed (Default)
                    <CheckCircle2 className="w-5 h-5 text-[#6ba3c7]" />
                  </button>
                  <button className="flex items-center justify-between px-4 py-3 bg-white rounded-xl font-medium text-gray-600 border border-gray-100">
                    Compact List
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
