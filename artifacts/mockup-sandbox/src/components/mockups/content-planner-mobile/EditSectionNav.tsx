import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, MoreVertical, Calendar as CalendarIcon, 
  MapPin, Wand2, Download, FileText, Type, 
  Link as LinkIcon, Folder, PlayCircle, MessageSquare, Plus, AlignLeft, LayoutList, Share2, Paperclip, ChevronRight, Check
} from 'lucide-react';
import './_group.css';

const SECTIONS = [
  { id: 'details', label: 'Details' },
  { id: 'dates', label: 'Dates' },
  { id: 'script', label: 'Script' },
  { id: 'description', label: 'Description' },
  { id: 'repurposed', label: 'Repurposed' },
  { id: 'files', label: 'Files' },
  { id: 'notes', label: 'Notes' },
];

export function EditSectionNav() {
  const [activeSection, setActiveSection] = useState('details');
  const [title, setTitle] = useState('October Calgary market snapshot');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('Editing');
  
  const sectionRefs = useRef<{ [key: string]: HTMLElement | null }>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id];
    if (el && scrollContainerRef.current) {
      // Offset for sticky header (Title + Nav = ~120px)
      const top = el.offsetTop - 120;
      scrollContainerRef.current.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    const scrollPosition = scrollContainerRef.current.scrollTop + 140; // Add offset
    
    let currentSection = SECTIONS[0].id;
    for (const section of SECTIONS) {
      const el = sectionRefs.current[section.id];
      if (el && el.offsetTop <= scrollPosition) {
        currentSection = section.id;
      }
    }
    
    if (currentSection !== activeSection) {
      setActiveSection(currentSection);
      // Auto-scroll the pill nav
      const pillNav = document.getElementById('pill-nav');
      const activePill = document.getElementById(`pill-${currentSection}`);
      if (pillNav && activePill) {
        pillNav.scrollTo({
          left: activePill.offsetLeft - pillNav.offsetWidth / 2 + activePill.offsetWidth / 2,
          behavior: 'smooth'
        });
      }
    }
  }, [activeSection]);

  // Simulated auto-save
  useEffect(() => {
    setIsSaving(true);
    const timer = setTimeout(() => setIsSaving(false), 800);
    return () => clearTimeout(timer);
  }, [title, status]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-50 p-4 font-sans text-slate-900">
      <div className="w-[390px] h-[844px] bg-white rounded-[40px] shadow-2xl overflow-hidden relative flex flex-col border-[8px] border-slate-900">
        
        {/* Sticky Header */}
        <div className="absolute top-0 inset-x-0 z-20 bg-white/90 backdrop-blur-xl border-b border-slate-200">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-4 pt-12 pb-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button className="p-1 -ml-1 text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
              
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                    {isSaving ? 'Saving...' : 'Saved'}
                  </span>
                  <div className="flex-1" />
                </div>
                <input 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="font-bold text-lg leading-tight truncate bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20 rounded px-1 -mx-1"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 pl-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#FDECC8] text-[#7A5A1F] whitespace-nowrap">
                <div className="w-1.5 h-1.5 rounded-full bg-[#7A5A1F]" />
                {status}
              </button>
              <button className="p-1 -mr-1 text-slate-400">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Progress Track (Thin line) */}
          <div className="flex w-full h-1 bg-slate-100">
            <div className="h-full bg-slate-300 w-1/6" /> {/* Idea */}
            <div className="h-full bg-slate-300 w-1/6" /> {/* Script */}
            <div className="h-full bg-slate-300 w-1/6" /> {/* Shot */}
            <div className="h-full bg-[#6ba3c7] w-1/6 relative"> {/* Editing (Current) */}
               <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#6ba3c7] shadow-[0_0_0_2px_white]" />
            </div>
            <div className="h-full bg-transparent w-1/6" /> {/* Scheduled */}
            <div className="h-full bg-transparent w-1/6" /> {/* Published */}
          </div>
          
          {/* Sticky Pill Nav */}
          <div 
            id="pill-nav"
            className="flex overflow-x-auto hide-scrollbar px-4 py-3 gap-2 border-b border-slate-100 shadow-sm"
          >
            {SECTIONS.map(section => (
              <button
                key={section.id}
                id={`pill-${section.id}`}
                onClick={() => scrollToSection(section.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  activeSection === section.id 
                    ? 'bg-slate-900 text-white shadow-md' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Content */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pt-[148px] pb-32 px-5 space-y-12"
        >
          
          {/* DETAILS */}
          <section id="details" ref={el => sectionRefs.current['details'] = el} className="scroll-mt-[140px]">
            <SectionHeader title="Details" icon={LayoutList} />
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Theme</label>
                <select className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-base rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#6ba3c7] focus:border-[#6ba3c7] appearance-none">
                  <option>Market Update</option>
                  <option>Buyer Tips</option>
                  <option>Seller FAQ</option>
                  <option>Neighbourhood Spotlight</option>
                </select>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead Magnet Campaign</label>
                <select className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-base rounded-xl px-4 py-3 appearance-none">
                  <option>Q4 Calgary Market Report PDF</option>
                  <option>First Time Buyer Guide</option>
                  <option>None</option>
                </select>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Shoot Location</label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button className="flex-1 py-2 text-sm font-medium bg-white rounded-lg shadow-sm">In Studio</button>
                  <button className="flex-1 py-2 text-sm font-medium text-slate-500">On Location</button>
                </div>
              </div>
              
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Binge Strategy</label>
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                  <div>
                    <div className="text-[11px] font-medium text-slate-400 mb-1">Links TO this video:</div>
                    <div className="flex items-start gap-2 text-sm">
                      <PlayCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-slate-700 leading-snug">September Interest Rate Update</span>
                    </div>
                  </div>
                  <div className="h-px bg-slate-200 w-full" />
                  <div>
                    <div className="text-[11px] font-medium text-slate-400 mb-1">This video links TO (Next in chain):</div>
                    <button className="w-full flex items-center justify-between text-left text-sm py-2 px-3 bg-white border border-slate-200 rounded-lg shadow-sm text-slate-500 hover:text-slate-900 transition-colors">
                      <div className="flex items-center gap-2">
                        <LinkIcon className="w-4 h-4" />
                        <span>Select next video...</span>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-50" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* DATES */}
          <section id="dates" ref={el => sectionRefs.current['dates'] = el} className="scroll-mt-[140px]">
            <SectionHeader title="Dates" icon={CalendarIcon} />
            <div className="grid grid-cols-2 gap-4">
              <DateCard label="Shoot Date" date="Oct 12, 2024" />
              <DateCard label="Edit Due" date="Oct 18, 2024" highlight />
              <DateCard label="Publish On" date="Oct 20, 2024" className="col-span-2" />
            </div>
          </section>

          {/* SCRIPT */}
          <section id="script" ref={el => sectionRefs.current['script'] = el} className="scroll-mt-[140px]">
            <SectionHeader title="Script & Outline" icon={AlignLeft} />
            <div className="space-y-6">
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Talking Points</label>
                </div>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl px-4 py-3 min-h-[100px] leading-relaxed resize-none focus:ring-2 focus:ring-[#6ba3c7] focus:bg-white"
                  defaultValue="- Intro hook: Rates paused again, but Calgary inventory is doing something weird.&#10;- Segment 1: Detached homes under $600k are evaporating.&#10;- Segment 2: Condo market cooling slightly? Days on market up 12%.&#10;- CTA: Download the Q4 neighbourhood breakdown."
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Full Script</label>
                  <button className="text-[#6ba3c7] text-xs font-medium flex items-center gap-1 hover:underline">
                    <Wand2 className="w-3.5 h-3.5" />
                    Arc Builder
                  </button>
                </div>
                <div className="relative group">
                  <textarea 
                    className="w-full bg-white border border-slate-200 text-slate-800 text-sm rounded-xl p-4 min-h-[240px] leading-relaxed focus:ring-2 focus:ring-[#6ba3c7] shadow-inner"
                    defaultValue="[INTRO HOOK - fast pace]&#10;The Bank of Canada just held rates steady, but if you're looking for a house in Calgary right now, it probably feels like the market didn't get the memo.&#10;&#10;[B-ROLL: Calgary skyline]&#10;Hey guys, October is here and the data from September just dropped. I want to show you exactly what's happening with detached homes versus condos, because they are behaving completely differently right now.&#10;&#10;[SEGMENT 1 - graphics on screen]&#10;First, let's talk about detached homes under $600,000..."
                  />
                  <div className="absolute bottom-3 right-3 flex gap-2">
                    <button className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors shadow-sm">
                      <Download className="w-4 h-4" />
                    </button>
                    <button className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors shadow-sm">
                      <FileText className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Research Notes</label>
                  <button className="text-slate-500 text-xs font-medium flex items-center gap-1 hover:text-slate-800">
                    <Wand2 className="w-3 h-3" />
                    Generate
                  </button>
                </div>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-600 text-sm rounded-xl px-4 py-3 min-h-[80px] leading-relaxed resize-none focus:ring-2 focus:ring-[#6ba3c7] focus:bg-white"
                  placeholder="Paste stats or links here..."
                  defaultValue="CREB September stats: Sales down 8% y/y, inventory up 14%, but still 35% below long-term averages. Benchmark price $596k."
                />
              </div>

            </div>
          </section>

          {/* DESCRIPTION */}
          <section id="description" ref={el => sectionRefs.current['description'] = el} className="scroll-mt-[140px]">
            <SectionHeader title="YouTube Assets" icon={Type} />
            <div className="space-y-6">
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Thumbnail Text</label>
                  <button className="text-[#6ba3c7] text-xs font-medium flex items-center gap-1 hover:underline">
                    Analyze <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <input 
                  className="w-full bg-white border border-slate-200 text-slate-800 text-base font-bold rounded-xl px-4 py-3 shadow-sm focus:ring-2 focus:ring-[#6ba3c7]"
                  defaultValue="CALGARY HOUSING: SHIFTING?"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</label>
                  <button className="text-[#6ba3c7] text-xs font-medium flex items-center gap-1 hover:underline">
                    <Wand2 className="w-3.5 h-3.5" />
                    AI Write
                  </button>
                </div>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-600 text-sm rounded-xl px-4 py-3 min-h-[120px] leading-relaxed resize-none focus:ring-2 focus:ring-[#6ba3c7] focus:bg-white"
                  defaultValue="Is the Calgary housing market finally cooling off, or is it just shifting? In this October 2024 update, I break down the latest numbers for detached homes and condos.&#10;&#10;📥 Download the Q4 Market Report: [LINK]"
                />
              </div>

            </div>
          </section>

          {/* REPURPOSED */}
          <section id="repurposed" ref={el => sectionRefs.current['repurposed'] = el} className="scroll-mt-[140px]">
            <div className="flex items-center justify-between mb-4">
              <SectionHeader title="Repurposed" icon={Share2} className="mb-0" />
              <button className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-3">
              <RepurposedCard type="Newsletter" status="Ready" date="Oct 21" icon={<FileText className="w-4 h-4 text-blue-500" />} />
              <RepurposedCard type="LinkedIn Post" status="Draft" icon={<LayoutList className="w-4 h-4 text-blue-700" />} />
              <RepurposedCard type="Email Blast" status="Draft" icon={<MessageSquare className="w-4 h-4 text-emerald-500" />} />
            </div>
            
            <button className="w-full mt-4 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-slate-300 transition-colors">
              <Wand2 className="w-4 h-4" />
              Generate Content
            </button>
          </section>

          {/* FILES */}
          <section id="files" ref={el => sectionRefs.current['files'] = el} className="scroll-mt-[140px]">
            <SectionHeader title="Files & Links" icon={Paperclip} />
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Raw Footage Link</label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl pl-9 pr-4 py-3 focus:ring-2 focus:ring-[#6ba3c7] focus:bg-white"
                    placeholder="https://frame.io/..."
                  />
                </div>
              </div>
              
              <div className="pt-2">
                <button className="w-full flex items-center justify-between p-4 bg-[#f8f9fa] border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100/50 flex items-center justify-center">
                      <Folder className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-slate-900">Project Drive Folder</div>
                      <div className="text-xs text-slate-500">3 files inside</div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>
          </section>

          {/* NOTES */}
          <section id="notes" ref={el => sectionRefs.current['notes'] = el} className="scroll-mt-[140px]">
            <SectionHeader title="Team Notes" icon={MessageSquare} />
            
            <div className="space-y-4">
              <div className="bg-[#fcf8e3] border border-[#f5e0a6] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#f2cc50] text-[#7a5a1f] flex items-center justify-center text-[10px] font-bold">SA</div>
                    <span className="text-xs font-medium text-[#7a5a1f]">Sarah (Editor)</span>
                  </div>
                  <span className="text-[10px] text-[#b38e40]">Oct 14</span>
                </div>
                <p className="text-sm text-[#7a5a1f] leading-relaxed">
                  The audio in the second clip has some background noise. I'll run it through enhancement, but might need a re-record if it's too noticeable.
                </p>
              </div>
              
              <div className="relative">
                <input 
                  placeholder="Add a note for the team..."
                  className="w-full bg-white border border-slate-200 text-sm rounded-xl pl-4 pr-12 py-3 shadow-sm focus:ring-2 focus:ring-[#6ba3c7]"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-[#6ba3c7] text-white rounded-lg hover:bg-blue-600">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            
          </section>

        </div>
        
        {/* Bottom Safety Gradient */}
        <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none z-10" />

      </div>
    </div>
  );
}

function SectionHeader({ title, icon: Icon, className = '' }: { title: string, icon: any, className?: string }) {
  return (
    <div className={`flex items-center gap-2 mb-6 ${className}`}>
      <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-slate-600" />
      </div>
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      <div className="flex-1 h-px bg-slate-200 ml-2" />
    </div>
  );
}

function DateCard({ label, date, highlight = false, className = '' }: { label: string, date: string, highlight?: boolean, className?: string }) {
  return (
    <div className={`p-3 rounded-xl border ${highlight ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-50 border-slate-200'} ${className}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-indigo-900' : 'text-slate-900'}`}>{date}</div>
    </div>
  );
}

function RepurposedCard({ type, status, date, icon }: { type: string, status: string, date?: string, icon: React.ReactNode }) {
  return (
    <button className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
          {icon}
        </div>
        <div className="text-left">
          <div className="text-sm font-medium text-slate-900">{type}</div>
          <div className="text-xs text-slate-500">
            {status === 'Ready' ? (
              <span className="text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" /> {status} {date && `· ${date}`}</span>
            ) : (
              <span>{status}</span>
            )}
          </div>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300" />
    </button>
  );
}
