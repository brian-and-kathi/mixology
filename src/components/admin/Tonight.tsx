import { GlassIcon } from "@/components/GlassIcon";
import { knockGlass } from "@/lib/night-pad";
import type { Night } from "@/lib/night";
import { RollNight } from "./RollNight";

function cap(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Host copy of today's knock and the words said at the door. */
export function Tonight({ night }: { night: Night }) {
  return (
    <section className="a-card a-night" aria-label="Tonight">
      <h2 className="a-h2">Tonight</h2>
      <div className="a-night-glasses">
        {night.glasses.map((id, index) => {
          const glass = knockGlass(id);
          if (!glass) return null;
          return (
            <div key={`${id}-${index}`} className="a-night-glass">
              <GlassIcon glass={glass.name} label="" />
              <span>{glass.label}</span>
            </div>
          );
        })}
      </div>
      <p className="a-night-words">
        “{cap(night.words.color)} {cap(night.words.verb)} {cap(night.words.animal)}”
      </p>
      <p className="a-quiet a-small">The knock, then the words said at the door.</p>
      <RollNight />
    </section>
  );
}
