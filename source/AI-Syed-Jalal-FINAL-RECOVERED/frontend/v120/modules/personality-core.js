/** AI-Syed Jalal personality layer. Optional, local, non-authoritative. */
export class PersonalityCore {
  constructor(options={}) { this.name=options.name||'Assistant'; this.energy=0.5; this.verbosity=0.75; }
  update(input='') { const words=input.trim().split(/\s+/).filter(Boolean).length; this.energy=Math.max(0,Math.min(1,this.energy+(words-10)*0.01)); return {energy:Number(this.energy.toFixed(2)),verbosity:this.verbosity}; }
  format(text,state=this.update(text)) { return `[${Math.round(state.energy*100)}%] ${text}`; }
}
