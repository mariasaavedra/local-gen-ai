"use client";

import usePayoutsCount from "@/lib/swr/use-payouts-count";
import useProgram from "@/lib/swr/use-program";
import useWorkspace from "@/lib/swr/use-workspace";
import { PayoutResponse } from "@/lib/types";
import { AmountRowItem } from "@/ui/partners/amount-row-item";
import { useMarkPayoutPaidModal } from "@/ui/partners/mark-payout-paid-modal";
import { PartnerRowItem } from "@/ui/partners/partner-row-item";
import { PayoutDetailsSheet } from "@/ui/partners/payout-details-sheet";
import { PayoutStatusBadges } from "@/ui/partners/payout-status-badges";
import { AnimatedEmptyState } from "@/ui/shared/animated-empty-state";
import {
  AnimatedSizeContainer,
  Button,
  Filter,
  Icon,
  Popover,
  StatusBadge,
  Table,
  Tooltip,
  usePagination,
  useRouterStuff,
  useTable,
} from "@dub/ui";
import { CircleCheck, Dots, MoneyBill2 } from "@dub/ui/icons";
import { cn, formatDate, formatDateTime, OG_AVATAR_URL } from "@dub/utils";
import { formatPeriod } from "@dub/utils/src/functions/datetime";
import { fetcher } from "@dub/utils/src/functions/fetcher";
import { Row } from "@tanstack/react-table";
import { Command } from "cmdk";
import { useParams, useRouter } from "next/navigation";
import { memo, useEffect, useState } from "react";
import useSWR from "swr";
import { usePayoutFilters } from "./use-payout-filters";

export function PayoutTable() {
  const filters = usePayoutFilters();
  return <PayoutTableInner {...filters} />;
}

const PayoutTableInner = memo(
  ({
    filters,
    activeFilters,
    onSelect,
    onRemove,
    onRemoveAll,
    isFiltered,
    setSearch,
    setSelectedFilter,
  }: ReturnType<typeof usePayoutFilters>) => {
    const { program } = useProgram();
    const { id: workspaceId } = useWorkspace();
    const { queryParams, searchParams, getQueryString } = useRouterStuff();

    const sortBy = searchParams.get("sortBy") || "amount";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    const { payoutsCount, error: countError } = usePayoutsCount<number>();

    const {
      data: payouts,
      error,
      isLoading,
    } = useSWR<PayoutResponse[]>(
      program?.id
        ? `/api/programs/${program.id}/payouts${getQueryString(
            { workspaceId },
            {
              exclude: ["payoutId"],
            },
          )}`
        : undefined,
      fetcher,
      {
        keepPreviousData: true,
      },
    );

    const [detailsSheetState, setDetailsSheetState] = useState<
      | { open: false; payout: PayoutResponse | null }
      | { open: true; payout: PayoutResponse }
    >({ open: false, payout: null });

    useEffect(() => {
      const payoutId = searchParams.get("payoutId");
      if (payoutId) {
        const payout = payouts?.find((p) => p.id === payoutId);
        if (payout) {
          setDetailsSheetState({ open: true, payout });
        }
      }
    }, [searchParams, payouts]);

    const { pagination, setPagination } = usePagination();

    const table = useTable({
      data: payouts || [],
      loading: isLoading,
      error: error || countError ? "Failed to load payouts" : undefined,
      columns: [
        {
          id: "periodStart",
          header: "Period",
          accessorFn: (d) => formatPeriod(d),
        },
        {
          header: "Partner",
          cell: ({ row }) => {
            return <PartnerRowItem partner={row.original.partner} />;
          },
        },
        {
          header: "Status",
          cell: ({ row }) => {
            const badge = PayoutStatusBadges[row.original.status];

            return badge ? (
              <StatusBadge icon={badge.icon} variant={badge.variant}>
                {badge.label}
              </StatusBadge>
            ) : (
              "-"
            );
          },
        },
        {
          header: "Paid",
          cell: ({ row }) =>
            row.original.paidAt ? (
              <Tooltip
                content={
                  <div className="flex flex-col gap-1 p-2.5">
                    {row.original.user && (
                      <div className="flex flex-col gap-2">
                        <img
                          src={
                            row.original.user.image ||
                            `${OG_AVATAR_URL}${row.original.user.name}`
                          }
                          alt={row.original.user.name ?? row.original.user.id}
                          className="size-6 shrink-0 rounded-full"
                        />
                        <p className="text-sm font-medium">
                          {row.original.user.name}
                        </p>
                      </div>
                    )}
                    <div className="text-xs text-neutral-500">
                      Paid at{" "}
                      <span className="font-medium text-neutral-700">
                        {formatDateTime(row.original.paidAt, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                }
              >
                <div className="flex items-center gap-2">
                  {row.original.user && (
                    <img
                      src={
                        row.original.user.image ||
                        `${OG_AVATAR_URL}${row.original.user.name}`
                      }
                      alt={row.original.user.name ?? row.original.user.id}
                      className="size-5 shrink-0 rounded-full"
                    />
                  )}
                  {formatDate(row.original.paidAt, {
                    month: "short",
                    year: undefined,
                  })}
                </div>
              </Tooltip>
            ) : (
              "-"
            ),
        },
        {
          id: "amount",
          header: "Amount",
          cell: ({ row }) => (
            <AmountRowItem
              amount={row.original.amount}
              status={row.original.status}
              payoutsEnabled={Boolean(row.original.partner.payoutsEnabledAt)}
              minPayoutAmount={program?.minPayoutAmount!}
            />
          ),
        },
        // Menu
        {
          id: "menu",
          enableHiding: false,
          minSize: 43,
          size: 43,
          maxSize: 43,
          cell: ({ row }) => <RowMenuButton row={row} />,
        },
      ],
      pagination,
      onPaginationChange: setPagination,
      sortableColumns: ["periodStart", "amount", "paidAt"],
      sortBy,
      sortOrder,
      onSortChange: ({ sortBy, sortOrder }) =>
        queryParams({
          set: {
            ...(sortBy && { sortBy }),
            ...(sortOrder && { sortOrder }),
          },
          del: "page",
          scroll: false,
        }),
      onRowClick: (row) => {
        queryParams({
          set: {
            payoutId: row.original.id,
          },
          scroll: false,
        });
      },
      columnPinning: { right: ["menu"] },
      thClassName: "border-l-0",
      tdClassName: "border-l-0",
      resourceName: (p) => `payout${p ? "s" : ""}`,
      rowCount: payoutsCount || 0,
    });

    return (
      <>
        {detailsSheetState.payout && (
          <PayoutDetailsSheet
            isOpen={detailsSheetState.open}
            setIsOpen={(open) =>
              setDetailsSheetState((s) => ({ ...s, open }) as any)
            }
            payout={detailsSheetState.payout}
          />
        )}
        <div className="flex flex-col gap-3">
          <div>
            <Filter.Select
              className="w-full md:w-fit"
              filters={filters}
              activeFilters={activeFilters}
              onSelect={onSelect}
              onRemove={onRemove}
              onSearchChange={setSearch}
              onSelectedFilterChange={setSelectedFilter}
            />
            <AnimatedSizeContainer height>
              <div>
                {activeFilters.length > 0 && (
                  <div className="pt-3">
                    <Filter.List
                      filters={filters}
                      activeFilters={activeFilters}
                      onRemove={onRemove}
                      onRemoveAll={onRemoveAll}
                    />
                  </div>
                )}
              </div>
            </AnimatedSizeContainer>
          </div>
          {payouts?.length !== 0 ? (
            <Table {...table} />
          ) : (
            <AnimatedEmptyState
              title="No payouts found"
              description={
                isFiltered
                  ? "No payouts found for the selected filters."
                  : "No payouts have been initiated for this program yet."
              }
              cardContent={() => (
                <>
                  <MoneyBill2 className="size-4 text-neutral-700" />
                  <div className="h-2.5 w-24 min-w-0 rounded-sm bg-neutral-200" />
                </>
              )}
            />
          )}
        </div>
      </>
    );
  },
);

function RowMenuButton({ row }: { row: Row<PayoutResponse> }) {
  const router = useRouter();
  const { slug, programId } = useParams();
  const [isOpen, setIsOpen] = useState(false);

  const { setShowMarkPayoutPaidModal, MarkPayoutPaidModal } =
    useMarkPayoutPaidModal({
      payout: row.original,
    });

  const isPayable = ["pending", "failed"].includes(row.original.status);

  if (!isPayable) return null;

  return (
    <>
      <MarkPayoutPaidModal />
      <Popover
        openPopover={isOpen}
        setOpenPopover={setIsOpen}
        content={
          <Command tabIndex={0} loop className="focus:outline-none">
            <Command.List className="flex w-screen flex-col gap-1 p-1.5 text-sm sm:w-auto sm:min-w-[140px]">
              <MenuItem
                icon={CircleCheck}
                label="Mark as paid"
                onSelect={() => {
                  setShowMarkPayoutPaidModal(true);
                  setIsOpen(false);
                }}
              />
            </Command.List>
          </Command>
        }
        align="end"
      >
        <Button
          type="button"
          className="h-8 whitespace-nowrap px-2"
          variant="outline"
          icon={<Dots className="h-4 w-4 shrink-0" />}
        />
      </Popover>
    </>
  );
}

function MenuItem({
  icon: IconComp,
  label,
  onSelect,
}: {
  icon: Icon;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-md p-2 text-sm text-neutral-600",
        "data-[selected=true]:bg-neutral-100",
      )}
      onSelect={onSelect}
    >
      <IconComp className="size-4 shrink-0 text-neutral-500" />
      {label}
    </Command.Item>
  );
}
