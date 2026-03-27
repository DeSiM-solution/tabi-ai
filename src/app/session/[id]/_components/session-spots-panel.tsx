'use client';

import { LuDownload, LuExternalLink, LuMapPin } from 'react-icons/lu';

import type { SpotsPanelViewModel } from '../_lib/spots-view-model';

import { SpotsMiniMap } from './spots-mini-map';

type SessionSpotsPanelProps = {
  viewModel: SpotsPanelViewModel;
  onOpenMaps: () => void;
  onDownloadCsv: () => void;
};

export function SessionSpotsPanel({
  viewModel,
  onOpenMaps,
  onDownloadCsv,
}: SessionSpotsPanelProps) {
  const hasItems = viewModel.items.length > 0;
  const hasMappableItems = viewModel.mappableItems.length > 0;
  const hasCsv = Boolean(viewModel.csvContent);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border-light px-4 py-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
          Spots Mini Map
        </p>
        <p className="mt-1 text-[12px] leading-[1.5] text-text-secondary">
          Sorted by video appearance time (earliest -&gt; latest)
        </p>
        <div className="mt-3">
          <SpotsMiniMap items={viewModel.mappableItems} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onOpenMaps}
            disabled={!hasMappableItems}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-accent-primary px-4 text-[13px] font-semibold text-text-inverse transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-border-default disabled:text-text-tertiary"
          >
            <LuExternalLink className="h-4 w-4" />
            <span>Open Maps</span>
          </button>
          <button
            type="button"
            onClick={onDownloadCsv}
            disabled={!hasCsv}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border-light bg-bg-secondary px-4 text-[13px] font-semibold text-text-primary transition hover:bg-bg-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LuDownload className="h-4 w-4" />
            <span>Download CSV</span>
          </button>
        </div>

        {viewModel.unresolvedItems.length > 0 && (
          <p className="mt-3 text-[12px] leading-[1.5] text-text-tertiary">
            {viewModel.unresolvedItems.length} spot
            {viewModel.unresolvedItems.length > 1 ? 's are' : ' is'} still missing
            coordinates, so only resolved items appear on the map.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
              CSV Spots Data
            </p>
            <p className="mt-1 text-[12px] leading-[1.5] text-text-secondary">
              {viewModel.csvRowCount > 0
                ? `${viewModel.csvRowCount} mapped spot${viewModel.csvRowCount > 1 ? 's' : ''} ready for export`
                : 'No CSV export available until spots have coordinates'}
            </p>
          </div>
        </div>

        {!hasItems ? (
          <div className="rounded-[14px] border border-dashed border-border-light bg-bg-secondary px-4 py-6 text-center">
            <p className="text-[13px] font-medium text-text-secondary">
              No spots available yet.
            </p>
            <p className="mt-1 text-[12px] leading-[1.5] text-text-tertiary">
              Generate or hydrate the current session data first, then this panel will summarize
              the mapped places here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {viewModel.items.map(item => (
              <article
                key={item.id}
                className="overflow-hidden rounded-[14px] border border-border-light bg-bg-secondary"
              >
                <div className="flex gap-3 p-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[10px] bg-bg-primary">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-text-tertiary">
                        <LuMapPin className="h-5 w-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-text-primary">
                          {item.name}
                        </p>
                        <p className="mt-1 text-[12px] leading-[1.5] text-text-secondary">
                          {item.description || 'No description yet.'}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                          item.hasCoordinates
                            ? 'bg-[#E7F8F4] text-[#0F766E]'
                            : 'bg-[#FFF7E8] text-[#9A5B13]'
                        }`}
                      >
                        {item.hasCoordinates ? 'Mapped' : 'Need coords'}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.tags.length > 0 ? (
                        item.tags.map(tag => (
                          <span
                            key={tag}
                            className="rounded-full bg-bg-elevated px-2 py-1 text-[11px] font-medium text-text-secondary"
                          >
                            #{tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-text-tertiary">No tags</span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
