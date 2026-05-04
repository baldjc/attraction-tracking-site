import React, { useState } from 'react';
import { 
  X, MoreHorizontal, Cloud, Calendar, Video, FileText, LayoutList, 
  Youtube, Image as ImageIcon, Search, Folder, Link2, 
  FileOutput, Users, ChevronDown, Check, Download, ExternalLink, Sparkles, Send
} from 'lucide-react';
import './_group.css';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export function EditBottomSheet() {
  const [title, setTitle] = useState("October Calgary market snapshot");
  
  const milestones = [
    { label: "Idea", status: "completed" },
    { label: "Script", status: "completed" },
    { label: "Shot", status: "completed" },
    { label: "Edited", status: "current" },
    { label: "Scheduled", status: "upcoming" },
    { label: "Published", status: "upcoming" }
  ];

  return (
    <div className="w-[390px] h-[844px] bg-slate-900 mx-auto relative overflow-hidden flex flex-col font-sans">
      {/* Fake background content to show the sheet sliding over it */}
      <div className="flex-1 p-4 opacity-50">
        <div className="h-8 w-1/2 bg-slate-800 rounded mb-4" />
        <div className="h-32 w-full bg-slate-800 rounded mb-4" />
        <div className="h-32 w-full bg-slate-800 rounded mb-4" />
      </div>

      {/* The Bottom Sheet */}
      <div className="absolute bottom-0 left-0 w-full h-[85%] bg-white rounded-t-3xl shadow-2xl flex flex-col transition-transform duration-300 transform translate-y-0">
        
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
        </div>

        {/* Sticky Header */}
        <div className="px-4 pb-4 pt-2 border-b border-slate-100 flex flex-col gap-3 sticky top-0 bg-white z-10 rounded-t-3xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold text-slate-900 w-full outline-none bg-transparent"
              />
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--st-editing-bg)] text-[var(--st-editing-text)]">
                  Editing
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Cloud className="w-3 h-3" /> Saved
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
                <MoreHorizontal className="w-5 h-5" />
              </button>
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Progress Track */}
          <div className="flex items-center justify-between gap-1 w-full mt-1">
            {milestones.map((m, i) => (
              <div key={m.label} className="flex-1 flex flex-col gap-1.5">
                <div className={`h-1 rounded-full w-full ${
                  m.status === 'completed' ? 'bg-[#6ba3c7]' : 
                  m.status === 'current' ? 'bg-[#7c5fde]' : 'bg-slate-100'
                }`} />
                <span className={`text-[9px] font-medium truncate ${
                  m.status === 'completed' ? 'text-[#6ba3c7]' : 
                  m.status === 'current' ? 'text-[#7c5fde]' : 'text-slate-400'
                }`}>
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar pb-24">
          <Accordion type="multiple" defaultValue={["quick-details"]} className="w-full">
            
            {/* Quick Details */}
            <AccordionItem value="quick-details" className="border-b-0 mb-2 border border-slate-100 rounded-xl px-4 py-1">
              <AccordionTrigger className="py-3 hover:no-underline flex gap-3 text-slate-700">
                <Calendar className="w-5 h-5 text-[#6ba3c7]" />
                <span className="font-semibold text-sm">Quick Details</span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500">Theme</label>
                    <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-[#6ba3c7]">
                      <option>Market Update</option>
                      <option>Buyer Tips</option>
                      <option>Listing Walkthrough</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-slate-500">Shoot Date</label>
                      <input type="date" defaultValue="2023-10-12" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-slate-500">Publish Date</label>
                      <input type="date" defaultValue="2023-10-20" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500">Shoot Location</label>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button className="flex-1 py-1.5 text-xs font-medium bg-white shadow-sm rounded-md text-slate-800">In Studio</button>
                      <button className="flex-1 py-1.5 text-xs font-medium text-slate-500">Out of Studio</button>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Script */}
            <AccordionItem value="script" className="border-b-0 mb-2 border border-slate-100 rounded-xl px-4 py-1">
              <AccordionTrigger className="py-3 hover:no-underline flex gap-3 text-slate-700">
                <FileText className="w-5 h-5 text-[#7c5fde]" />
                <span className="font-semibold text-sm">Script</span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="flex flex-col gap-3">
                  <textarea 
                    className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-mono leading-relaxed"
                    defaultValue="Hey everyone, it's October and we need to talk about what's happening in the Calgary real estate market.&#10;&#10;Inventory is tightening up in the detached segment, and we're seeing multiple offers return to the $500k-$600k range. Let's break down the numbers..."
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <button className="p-2 bg-slate-100 text-slate-600 rounded hover:bg-slate-200"><Download className="w-4 h-4" /></button>
                    </div>
                    <button className="text-xs font-medium text-[#7c5fde] flex items-center gap-1 hover:underline">
                      Open in Arc Script Builder <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Talking Points */}
            <AccordionItem value="talking-points" className="border-b-0 mb-2 border border-slate-100 rounded-xl px-4 py-1">
              <AccordionTrigger className="py-3 hover:no-underline flex gap-3 text-slate-700">
                <LayoutList className="w-5 h-5 text-slate-400" />
                <span className="font-semibold text-sm">Outline / Talking Points</span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <textarea 
                  className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700"
                  defaultValue="- Intro hook: Multiple offers are back?&#10;- Detached inventory stats&#10;- Condo market update&#10;- Advice for buyers&#10;- Call to action"
                />
              </AccordionContent>
            </AccordionItem>

            {/* Youtube Description */}
            <AccordionItem value="description" className="border-b-0 mb-2 border border-slate-100 rounded-xl px-4 py-1">
              <AccordionTrigger className="py-3 hover:no-underline flex gap-3 text-slate-700">
                <Youtube className="w-5 h-5 text-red-500" />
                <span className="font-semibold text-sm">YouTube Info</span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-medium text-slate-500">Description</label>
                    <button className="text-xs font-medium text-[#7c5fde] flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI Generate
                    </button>
                  </div>
                  <textarea 
                    className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700"
                    defaultValue="Thinking of buying or selling in Calgary this fall? Here is exactly what you need to know about the October market..."
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-medium text-slate-500">Thumbnail Concept</label>
                    <button className="text-[10px] font-medium text-slate-500 flex items-center gap-1 hover:underline">
                      Title & Thumbnail Analyzer <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <input 
                    type="text"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700"
                    defaultValue="Me looking shocked + 'MARKET SHIFT?!' text + Calgary skyline"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Research Notes */}
            <AccordionItem value="research" className="border-b-0 mb-2 border border-slate-100 rounded-xl px-4 py-1">
              <AccordionTrigger className="py-3 hover:no-underline flex gap-3 text-slate-700">
                <Search className="w-5 h-5 text-slate-400" />
                <span className="font-semibold text-sm">Research Notes</span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="flex flex-col gap-2">
                  <textarea 
                    className="w-full h-20 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700"
                    defaultValue="CREB report released Oct 2nd shows sales down 10% YoY but prices up 4%."
                  />
                  <button className="w-full py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-200">
                    <Sparkles className="w-4 h-4" /> Generate Research Prompt
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Production Assets */}
            <AccordionItem value="production" className="border-b-0 mb-2 border border-slate-100 rounded-xl px-4 py-1">
              <AccordionTrigger className="py-3 hover:no-underline flex gap-3 text-slate-700">
                <Folder className="w-5 h-5 text-amber-500" />
                <span className="font-semibold text-sm">Production Assets</span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-500">Footage Link</label>
                  <div className="flex gap-2">
                    <input 
                      type="url"
                      className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700"
                      placeholder="https://frame.io/..."
                    />
                    <button className="px-3 bg-slate-100 rounded-lg text-slate-600"><Link2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                    <Folder className="w-4 h-4" /> Drive Folder
                  </button>
                  <button className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                    <FileOutput className="w-4 h-4" /> Project Files
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Strategy */}
            <AccordionItem value="strategy" className="border-b-0 mb-2 border border-slate-100 rounded-xl px-4 py-1">
              <AccordionTrigger className="py-3 hover:no-underline flex gap-3 text-slate-700">
                <Link2 className="w-5 h-5 text-emerald-500" />
                <span className="font-semibold text-sm">Links & Strategy</span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-500">Lead Magnet Campaign</label>
                  <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                    <option>Calgary Relocation Guide</option>
                    <option>First Time Buyer Checklist</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-500">Binge Video (Links to)</label>
                  <div className="flex items-center p-2 bg-slate-50 border border-slate-200 rounded-lg gap-2">
                    <Video className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-700 flex-1 truncate">September Market Update</span>
                    <X className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-500">Binged From</label>
                  <p className="text-sm text-slate-500 italic">No videos link to this yet.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Repurposed Content */}
            <AccordionItem value="repurposed" className="border-b-0 mb-2 border border-slate-100 rounded-xl px-4 py-1">
              <AccordionTrigger className="py-3 hover:no-underline flex items-center justify-between w-full">
                <div className="flex gap-3 text-slate-700">
                  <Send className="w-5 h-5 text-[#6ba3c7]" />
                  <span className="font-semibold text-sm">Repurposed Content</span>
                </div>
                <div className="bg-slate-100 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full mr-2">3</div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border border-slate-100 rounded-lg bg-slate-50">
                    <span className="text-sm font-medium text-slate-700">Newsletter</span>
                    <span className="text-xs text-[#6ba3c7] font-medium">Draft</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border border-slate-100 rounded-lg bg-slate-50">
                    <span className="text-sm font-medium text-slate-700">LinkedIn Post</span>
                    <span className="text-xs text-slate-500 font-medium">Published</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border border-slate-100 rounded-lg bg-slate-50">
                    <span className="text-sm font-medium text-slate-700">Email Campaign</span>
                    <span className="text-xs text-slate-500 font-medium">Scheduled</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Team Notes */}
            <AccordionItem value="team" className="border-b-0 mb-2 border border-slate-100 rounded-xl px-4 py-1 bg-slate-50/50">
              <AccordionTrigger className="py-3 hover:no-underline flex items-center justify-between w-full">
                <div className="flex gap-3 text-slate-700">
                  <Users className="w-5 h-5 text-slate-400" />
                  <span className="font-semibold text-sm">Team Notes</span>
                </div>
                <div className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full mr-2">1</div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1 font-medium">Sarah (Editor) - Oct 14</p>
                  <p className="text-sm text-slate-700">Audio was a bit echoey in the studio on this one, applying some AI cleanup.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </div>
      </div>
    </div>
  );
}
