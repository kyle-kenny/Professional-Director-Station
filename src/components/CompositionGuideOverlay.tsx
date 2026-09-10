import {
  compositionGuideDefinitions,
  compositionGuideRects,
  compositionGuideSegments,
  type CompositionGuideVisibility,
} from '../domain/compositionGuides';
import '../composition-guides.css';

type CompositionGuideOverlayProps = {
  visibility: CompositionGuideVisibility;
};

export function CompositionGuideOverlay({ visibility }: CompositionGuideOverlayProps) {
  return <div className="composition-guide-overlay" aria-hidden="true" data-composition-guide-overlay>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="presentation">
      {compositionGuideDefinitions.map((definition) => {
        if (!visibility[definition.id]) return null;
        const segments = compositionGuideSegments(definition.id);
        const rects = compositionGuideRects(definition.id);
        return <g key={definition.id} data-composition-guide={definition.id} className={`composition-guide composition-guide-${definition.id}`}>
          {segments.map((segment, index) => <line
            key={`line-${index}`}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            vectorEffect="non-scaling-stroke"
          />)}
          {rects.map((rect, index) => <rect
            key={`rect-${index}`}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            vectorEffect="non-scaling-stroke"
          />)}
        </g>;
      })}
    </svg>
  </div>;
}
