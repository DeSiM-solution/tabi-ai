'use client';

import type { CSSProperties } from 'react';
import { cva } from 'class-variance-authority';
import { motion, useReducedMotion } from 'framer-motion';
import { LuCheck } from 'react-icons/lu';
import { cn } from '@/lib/cn';
import {
  HANDBOOK_STYLE_OPTIONS,
  type HandbookStyleId,
} from '@/lib/handbook-style';

type AestheticStyleSelectorProps = {
  value: HandbookStyleId;
  onChange: (styleId: HandbookStyleId) => void;
  disabled?: boolean;
  className?: string;
};

const selectorContainerClass = cva('flex flex-nowrap items-start justify-between gap-1');

const styleOptionButtonClass = cva(
  'group relative w-[80px] p-0 text-center transition disabled:cursor-not-allowed disabled:opacity-60',
);

const styleSwatchClass = cva(
  'relative mx-auto flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-[24px] border-2 border-[#E4E4E7]',
  {
    variants: {
      tone: {
        default: 'bg-bg-elevated',
        brutalist: 'bg-zinc-900',
      },
    },
    defaultVariants: {
      tone: 'default',
    },
  },
);

const styleLabelClass = cva('mt-2 block text-[13px] font-medium leading-[1.25]', {
  variants: {
    selected: {
      true: 'text-text-primary',
      false: 'text-text-secondary',
    },
  },
  defaultVariants: {
    selected: false,
  },
});

function toSwatchBackground(styleId: HandbookStyleId): CSSProperties | undefined {
  if (styleId === 'warm-analog') {
    return {
      background:
        'linear-gradient(145deg, rgb(254, 247, 230) 0%, rgb(245, 230, 200) 40%, rgb(232, 212, 168) 100%)',
    };
  }
  if (styleId === 'dreamy-soft') {
    return {
      background:
        'linear-gradient(145deg, rgb(253, 244, 255) 0%, rgb(243, 232, 255) 40%, rgb(233, 213, 255) 100%)',
    };
  }
  return undefined;
}

function toSelectedShadow(styleId: HandbookStyleId): string {
  if (styleId === 'warm-analog') return '0 10px 20px rgba(196, 157, 86, 0.28)';
  if (styleId === 'brutalist') return '0 10px 20px rgba(244, 63, 94, 0.34)';
  if (styleId === 'dreamy-soft') return '0 10px 20px rgba(168, 85, 247, 0.26)';
  if (styleId === 'let-tabi-decide') return '0 10px 20px rgba(113, 113, 122, 0.26)';
  return '0 10px 20px rgba(161, 161, 170, 0.28)';
}

function toHoverShadow(styleId: HandbookStyleId, selected: boolean): string {
  if (!selected) return '0 12px 22px rgba(45,42,38,0.16)';
  if (styleId === 'warm-analog') return '0 14px 26px rgba(196, 157, 86, 0.32)';
  if (styleId === 'brutalist') return '0 14px 26px rgba(244, 63, 94, 0.38)';
  if (styleId === 'dreamy-soft') return '0 14px 26px rgba(168, 85, 247, 0.3)';
  if (styleId === 'let-tabi-decide') return '0 14px 26px rgba(113, 113, 122, 0.3)';
  return '0 14px 26px rgba(161, 161, 170, 0.32)';
}

function StyleSwatch({
  styleId,
  selected,
  disabled,
}: {
  styleId: HandbookStyleId;
  selected: boolean;
  disabled: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const motionTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 180, damping: 30, mass: 1.2 };

  return (
    <motion.span
      className={styleSwatchClass({
        tone: styleId === 'brutalist' ? 'brutalist' : 'default',
      })}
      style={toSwatchBackground(styleId)}
      initial={false}
      animate={{
        boxShadow: selected
          ? toSelectedShadow(styleId)
          : '0 4px 10px rgba(45,42,38,0.1)',
      }}
      whileHover={
        disabled || prefersReducedMotion
          ? {}
          : {
              scale: 1.015,
              y: -2,
              boxShadow: toHoverShadow(styleId, selected),
            }
      }
      transition={motionTransition}
    >
      {styleId === 'minimal-tokyo' && (
        <span className="absolute left-[5px] top-[5px] grid h-[54px] w-[54px] grid-cols-5 gap-[6px]">
          {Array.from({ length: 25 }, (_, index) => (
            <span
              key={`dot-${index}`}
              className="h-[6px] w-[6px] rounded-full bg-[#C4C4C4]"
            />
          ))}
        </span>
      )}
      {styleId === 'brutalist' && (
        <span className="block h-[28px] w-[28px] rounded-[6px] bg-rose-500" />
      )}
      {styleId === 'let-tabi-decide' && (
        <span className="block text-[20px] leading-none font-semibold text-[#71717A]">旅</span>
      )}

      <motion.span
        className="absolute right-[6px] top-[6px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary text-text-inverse"
        initial={false}
        animate={{
          scale: selected ? 1 : 0,
          opacity: selected ? 1 : 0,
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 500, damping: 30 }
        }
      >
        <LuCheck className="h-3 w-3" />
      </motion.span>
    </motion.span>
  );
}

export function AestheticStyleSelector({
  value,
  onChange,
  disabled = false,
  className,
}: AestheticStyleSelectorProps) {
  return (
    <div className={cn(selectorContainerClass(), className)}>
      {HANDBOOK_STYLE_OPTIONS.map(option => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={selected}
            disabled={disabled}
            className={styleOptionButtonClass()}
          >
            <StyleSwatch styleId={option.id} selected={selected} disabled={disabled} />
            <span className={styleLabelClass({ selected })}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
