import React, { useState } from 'react';
import { 
  ArrowLeft, 
  MoreHorizontal, 
  Cloud, 
  Download, 
  ExternalLink, 
  Wand2, 
  CalendarIcon, 
  MapPin, 
  Tag, 
  FileText, 
  CheckCircle2, 
  Video, 
  Folder, 
  Trash2, 
  Mail, 
  Linkedin,
  Clock,
  Sparkles,
  RefreshCw,
  FolderOpen,
  ChevronRight,
  Plus,
  FileDown
} from 'lucide-react';
import './_group.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  Idea: { label: 'Idea', className: 'st-idea' },
  Scripting: { label: 'Scripting', className: 'st-scripted' },
  Shooting: { label: 'Shooting', className: 'st-shooting' },
  Editing: { label: 'Editing', className: 'st-editing' },
  Scheduled: { label: 'Scheduled', className: 'st-scheduled' },
  Published: { label: 'Published', className: 'st-published' },
};

const PROGRESS_STAGES = [
  'Idea', 'Script', 'Shot', 'Edited', 'Scheduled', 'Published'
];

export function EditFullScreen() {
  const [activeTab, setActiveTab] = useState('script');
  const [title, setTitle] = useState('October Calgary market snapshot');
  const [status, setStatus] = useState('Editing');
  const [isSaving, setIsSaving] = useState(false);

  // Mock saving effect
  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 1000);
  };

  const getStatusColor = (s: string) => {
    if (s === 'Idea') return 'bg-[#E3E2E0] text-[#3F3D38]';
    if (s === 'Script') return 'bg-[#D3E5EF] text-[#183347]';
    if (s === 'Shot') return 'bg-[#F5E0E9] text-[#6D2A4D]';
    if (s === 'Editing' || s === 'Edited') return 'bg-[#FDECC8] text-[#7A5A1F]';
    if (s === 'Scheduled') return 'bg-[#FADEC9] text-[#854C1D]';
    if (s === 'Published') return 'bg-[#DBEDDB] text-[#2B593F]';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="w-[390px] h-[844px] bg-white border border-gray-200 overflow-hidden flex flex-col mx-auto shadow-xl text-[15px]">
      
      {/* HEADER - Sticky */}
      <header className="flex-none bg-white border-b border-gray-100 z-10">
        <div className="flex items-center justify-between px-2 h-14">
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Button>
          
          <div className="flex items-center gap-2 px-2 flex-1 min-w-0 justify-end">
            {isSaving ? (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Saving...
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Cloud className="w-3.5 h-3.5" />
                Saved
              </div>
            )}
            
            <Select value={status} onValueChange={(v) => { setStatus(v); handleSave(); }}>
              <SelectTrigger className="h-8 w-auto min-w-[100px] border-0 bg-transparent focus:ring-0 px-0 shadow-none gap-1 font-medium justify-end">
                <div className={`px-2.5 py-1 rounded-full text-[13px] font-medium whitespace-nowrap flex items-center ${getStatusColor(status)}`}>
                  {status}
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Idea">Idea</SelectItem>
                <SelectItem value="Script">Scripting</SelectItem>
                <SelectItem value="Shooting">Shooting</SelectItem>
                <SelectItem value="Editing">Editing</SelectItem>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="Published">Published</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
              <MoreHorizontal className="w-5 h-5 text-gray-600" />
            </Button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <input 
            type="text" 
            value={title}
            onChange={(e) => { setTitle(e.target.value); handleSave(); }}
            className="w-full text-xl font-bold text-gray-900 bg-transparent border-0 p-0 focus:ring-0 placeholder:text-gray-300"
            placeholder="Video Title"
          />
        </div>

        {/* PROGRESS TRACK */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-100 -z-10" />
            {PROGRESS_STAGES.map((stage, idx) => {
              const isActive = idx <= PROGRESS_STAGES.indexOf('Edited');
              const isCurrent = stage === 'Edited';
              return (
                <div key={stage} className="flex flex-col items-center gap-1 relative bg-white px-1">
                  <div className={`w-3 h-3 rounded-full border-2 ${
                    isActive 
                      ? 'border-[#6ba3c7] bg-[#6ba3c7]' 
                      : 'border-gray-200 bg-white'
                  }`} />
                  <span className={`text-[10px] font-medium absolute -bottom-4 whitespace-nowrap ${
                    isActive ? 'text-gray-900' : 'text-gray-400'
                  }`}>
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* TABS */}
        <div className="px-2 mt-6 border-b border-gray-100">
          <ScrollArea className="w-full" type="scroll">
            <div className="flex w-full space-x-1 pb-2">
              {[
                { id: 'details', label: 'Details' },
                { id: 'script', label: 'Script & Notes' },
                { id: 'publish', label: 'Publish' },
                { id: 'more', label: 'More' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${
                    activeTab === tab.id 
                      ? 'bg-gray-100 text-gray-900' 
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        </div>
      </header>

      {/* CONTENT AREA */}
      <ScrollArea className="flex-1 bg-[#FAFAFA]">
        <div className="p-4 pb-20 space-y-6">
          
          {/* --- TAB: DETAILS --- */}
          <div className={activeTab === 'details' ? 'block' : 'hidden'}>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="p-4 space-y-5">
                
                <div className="space-y-4">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dates</Label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-700">
                        <Video className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">Shoot Date</span>
                      </div>
                      <Button variant="outline" className="h-8 text-sm font-normal">Oct 12, 2023</Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-700">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">Edit Due</span>
                      </div>
                      <Button variant="outline" className="h-8 text-sm font-normal text-gray-400 border-dashed">Set Date</Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-700">
                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">Publish Date</span>
                      </div>
                      <Button variant="outline" className="h-8 text-sm font-normal">Oct 20, 2023</Button>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Categorization</Label>
                  
                  <div className="space-y-1.5">
                    <Label className="text-sm text-gray-700 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-gray-400" /> Theme
                    </Label>
                    <Select defaultValue="market-update">
                      <SelectTrigger className="w-full h-11 bg-gray-50/50">
                        <SelectValue placeholder="Select Theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="market-update">Market Update</SelectItem>
                        <SelectItem value="buyer-tips">Buyer Tips</SelectItem>
                        <SelectItem value="listing">Listing Walkthrough</SelectItem>
                        <SelectItem value="seller-faq">Seller FAQ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <Label className="text-sm text-gray-700 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" /> Shoot Location
                    </Label>
                    <Select defaultValue="in-studio">
                      <SelectTrigger className="w-full h-11 bg-gray-50/50">
                        <SelectValue placeholder="Select Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in-studio">In Studio</SelectItem>
                        <SelectItem value="out-of-studio">Out of Studio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* --- TAB: SCRIPT & NOTES --- */}
          <div className={activeTab === 'script' ? 'space-y-4' : 'hidden'}>
            
            {/* Outline / Talking Points */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold text-gray-900">Talking Points</Label>
              </div>
              <Textarea 
                className="min-h-[120px] bg-gray-50/50 resize-none text-sm leading-relaxed" 
                defaultValue="- Intro: Welcome back, it's October!
- Stat 1: Benchmark price is up 2% month-over-month.
- Stat 2: Inventory is still extremely tight, especially under $500k.
- Advice for Buyers: Be prepared to act fast. Have financing ready.
- Outro: Call me if you need help navigating this market."
              />
            </div>

            {/* Research Notes */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold text-gray-900">Research Notes</Label>
              </div>
              <Textarea 
                className="min-h-[100px] bg-gray-50/50 resize-none text-sm leading-relaxed" 
                placeholder="Paste research, stats, or links here..."
                defaultValue="CREB September report indicates sales are 45% above long-term trends.
Months of supply sits at just 1.1 months."
              />
              <Button variant="outline" className="w-full h-10 gap-2 text-[#7c5fde] hover:text-[#7c5fde] hover:bg-[#7c5fde]/5 border-[#7c5fde]/20">
                <Sparkles className="w-4 h-4" />
                Generate Research Prompt
              </Button>
            </div>

            {/* Full Script */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold text-gray-900">Full Script</Label>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-900">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Textarea 
                className="min-h-[250px] bg-gray-50/50 resize-none text-sm leading-relaxed font-serif" 
                defaultValue="Hey everyone, welcome back. If you're looking to buy or sell in Calgary right now, you need to hear this. 

The October numbers are in, and the story is the same: tight inventory and rising prices. The benchmark price has ticked up another 2% month-over-month, and we are seeing less than a month and a half of supply across the city.

If you are a buyer, especially looking under the $500,000 mark, you have to be ready. Have your pre-approval in hand, and be prepared to write an aggressive offer."
              />
              
              <div className="pt-2">
                <Button className="w-full h-11 bg-[#1A1A1A] hover:bg-[#333] text-white gap-2 font-medium">
                  Open in Arc Script Builder <ArrowLeft className="w-4 h-4 rotate-135" />
                </Button>
              </div>
            </div>

          </div>

          {/* --- TAB: PUBLISH --- */}
          <div className={activeTab === 'publish' ? 'space-y-4' : 'hidden'}>
            
            {/* Thumbnail */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 shadow-sm">
              <Label className="text-base font-semibold text-gray-900">Thumbnail Vision</Label>
              <div className="space-y-2">
                <Input 
                  className="bg-gray-50/50 h-11" 
                  placeholder="Text on thumbnail" 
                  defaultValue="CALGARY MARKET EXPLODING?" 
                />
              </div>
              <div className="pt-2">
                <Button className="w-full h-11 bg-white border border-[#7c5fde]/30 text-[#7c5fde] hover:bg-[#7c5fde]/5 gap-2 font-medium shadow-sm">
                  Open in Title & Thumbnail Analyzer <ArrowLeft className="w-4 h-4 rotate-135" />
                </Button>
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold text-gray-900">YouTube Description</Label>
              </div>
              <Textarea 
                className="min-h-[150px] bg-gray-50/50 resize-none text-sm" 
                placeholder="Video description..."
                defaultValue="Here is what you need to know about the Calgary Real Estate market going into October. We cover benchmark prices, inventory levels, and what it means for buyers and sellers."
              />
              <Button variant="outline" className="w-full h-10 gap-2 text-gray-600">
                <Wand2 className="w-4 h-4" />
                AI Generate Description
              </Button>
            </div>

            {/* Links */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4 shadow-sm">
              <Label className="text-base font-semibold text-gray-900">Assets & Links</Label>
              
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700">Raw Footage Link</Label>
                <Input 
                  className="bg-gray-50/50 h-11 font-mono text-sm text-blue-600" 
                  placeholder="https://..." 
                  defaultValue="https://frame.io/review/abcd-1234" 
                />
              </div>
              
              <div className="space-y-1.5 pt-2">
                <Label className="text-sm text-gray-700">Lead Magnet Campaign</Label>
                <Select defaultValue="calgary-relocation">
                  <SelectTrigger className="w-full h-11 bg-gray-50/50">
                    <SelectValue placeholder="Select Campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="calgary-relocation">Calgary Relocation Guide</SelectItem>
                    <SelectItem value="buyer-checklist">First-Time Buyer Checklist</SelectItem>
                    <SelectItem value="seller-prep">Home Prep Guide</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
          </div>

          {/* --- TAB: MORE --- */}
          <div className={activeTab === 'more' ? 'space-y-4' : 'hidden'}>
            
            {/* Repurposed */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4 shadow-sm">
              <Label className="text-base font-semibold text-gray-900">Repurposed Content</Label>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-300 transition-colors active:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">Weekly Newsletter</div>
                      <div className="text-xs text-gray-500">Draft • Oct 18</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
                
                <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-300 transition-colors active:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <Linkedin className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">LinkedIn Post</div>
                      <div className="text-xs text-gray-500">Ready • Oct 20</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>

                <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-300 transition-colors active:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">Database Email</div>
                      <div className="text-xs text-gray-500">Scheduled • Oct 20</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
              
              <Button variant="ghost" className="w-full text-[#6ba3c7] font-medium h-10 bg-[#6ba3c7]/5">
                <Plus className="w-4 h-4 mr-2" /> Create New Asset
              </Button>
            </div>

            {/* Binge Video */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4 shadow-sm">
              <Label className="text-base font-semibold text-gray-900">Binge Path</Label>
              
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700">Link to Next Video</Label>
                <div className="flex items-center p-3 border border-gray-200 rounded-lg bg-gray-50">
                  <Video className="w-4 h-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600 flex-1 truncate">September Market Update</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1">
                    <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <Label className="text-sm text-gray-700">Binged From</Label>
                <div className="flex flex-col gap-2">
                  <div className="text-sm text-gray-600 flex items-center gap-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-gray-300">
                    Why move to Airdrie?
                  </div>
                  <div className="text-sm text-gray-600 flex items-center gap-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-gray-300">
                    Interest rate announcement reaction
                  </div>
                </div>
              </div>
            </div>

            {/* Integrations & Notes */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="p-4 space-y-5">
                
                <div className="space-y-3">
                  <Label className="text-base font-semibold text-gray-900">Drive Assets</Label>
                  <Button variant="outline" className="w-full justify-start h-11 text-gray-700">
                    <FolderOpen className="w-4 h-4 mr-2 text-blue-500" />
                    Open Google Drive Folder
                  </Button>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FileDown className="w-4 h-4 text-gray-400" /> thumbnail_v2.png
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FileDown className="w-4 h-4 text-gray-400" /> b-roll_drone.mp4
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                <div className="space-y-3">
                  <Label className="text-base font-semibold text-gray-900">Team Notes</Label>
                  <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100">
                    <p className="text-sm text-amber-900">
                      <span className="font-semibold mr-1">Sarah (Editor):</span>
                      Audio is a bit blown out around 2:15, will try to fix in post. Please check the draft when ready.
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Danger Zone */}
            <div className="px-4 py-8">
              <Button variant="ghost" className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 h-11">
                <Trash2 className="w-4 h-4 mr-2" /> Delete Video Plan
              </Button>
            </div>

          </div>

        </div>
      </ScrollArea>
    </div>
  );
}