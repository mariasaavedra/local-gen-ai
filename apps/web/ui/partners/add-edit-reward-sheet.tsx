"use client";

import { createRewardAction } from "@/lib/actions/partners/create-reward";
import { deleteRewardAction } from "@/lib/actions/partners/delete-reward";
import { updateRewardAction } from "@/lib/actions/partners/update-reward";
import { handleMoneyInputChange, handleMoneyKeyDown } from "@/lib/form-utils";
import { mutatePrefix } from "@/lib/swr/mutate";
import useProgram from "@/lib/swr/use-program";
import useRewardPartners from "@/lib/swr/use-reward-partners";
import useRewards from "@/lib/swr/use-rewards";
import useWorkspace from "@/lib/swr/use-workspace";
import { RewardProps } from "@/lib/types";
import { RECURRING_MAX_DURATIONS } from "@/lib/zod/schemas/misc";
import {
  COMMISSION_TYPES,
  createRewardSchema,
} from "@/lib/zod/schemas/rewards";
import { X } from "@/ui/shared/icons";
import { EventType } from "@dub/prisma/client";
import {
  AnimatedSizeContainer,
  Button,
  CircleCheckFill,
  InfoTooltip,
  Sheet,
  Switch,
  Tooltip,
} from "@dub/ui";
import { cn, pluralize } from "@dub/utils";
import { useAction } from "next-safe-action/hooks";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import {
  FieldErrors,
  useForm,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import { toast } from "sonner";
import { mutate } from "swr";
import { z } from "zod";
import { RewardPartnersTable } from "./reward-partners-table";

interface RewardSheetProps {
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  event: EventType;
  reward?: RewardProps;
  isDefault?: boolean;
}

type FormData = z.infer<typeof createRewardSchema>;

const PARTNER_TYPES = [
  {
    key: "all",
    label: "All Partners",
    description: "Everyone is eligible",
  },
  {
    key: "specific",
    label: "Specific Partners",
    description: "Select who is eligible",
  },
] as const;

const DEFAULT_REWARD_TYPES = [
  {
    key: "lead",
    label: "Lead",
    description: "For sign ups and leads",
  },
  {
    key: "sale",
    label: "Sale",
    description: "For sales and subscriptions",
  },
] as const;

function RewardSheetContent({
  setIsOpen,
  event,
  reward,
  isDefault,
}: RewardSheetProps) {
  const { rewards } = useRewards();
  const { id: workspaceId } = useWorkspace();
  const formRef = useRef<HTMLFormElement>(null);
  const { program, mutate: mutateProgram } = useProgram();

  const [selectedPartnerType, setSelectedPartnerType] =
    useState<(typeof PARTNER_TYPES)[number]["key"]>("all");

  const [commissionStructure, setCommissionStructure] = useState<
    "one-off" | "recurring"
  >("recurring");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      event,
      type: reward?.type || (event === "sale" ? "percentage" : "flat"),
      maxDuration: reward
        ? reward.maxDuration === null
          ? Infinity
          : reward.maxDuration
        : Infinity,
      amount: reward?.type === "flat" ? reward.amount / 100 : reward?.amount,
      maxAmount: reward?.maxAmount ? reward.maxAmount / 100 : null,
      partnerIds: null,
    },
  });

  useEffect(() => {
    if (reward) {
      setCommissionStructure(
        reward.maxDuration === 0 ? "one-off" : "recurring",
      );
    }
  }, [reward]);

  const [amount, type, partnerIds = []] = watch([
    "amount",
    "type",
    "partnerIds",
  ]);

  const selectedEvent = watch("event");

  const hasProgramWideClickReward = rewards?.some(
    (reward) => reward.event === "click" && reward.partnersCount === 0,
  );

  const hasProgramWideLeadReward = rewards?.some(
    (reward) => reward.event === "lead" && reward.partnersCount === 0,
  );

  const hasProgramWideSaleReward = rewards?.some(
    (reward) => reward.event === "sale" && reward.partnersCount === 0,
  );

  useEffect(() => {
    if (reward) {
      setSelectedPartnerType(reward.partnersCount === 0 ? "all" : "specific");
    } else if (
      (selectedEvent === "click" && hasProgramWideClickReward) ||
      (selectedEvent === "lead" && hasProgramWideLeadReward) ||
      (selectedEvent === "sale" && hasProgramWideSaleReward)
    ) {
      setSelectedPartnerType("specific");
    } else {
      setSelectedPartnerType("all");
    }
  }, [
    reward,
    selectedEvent,
    hasProgramWideClickReward,
    hasProgramWideLeadReward,
    hasProgramWideSaleReward,
  ]);

  const { data: rewardPartners, loading: isLoadingRewardPartners } =
    useRewardPartners({
      query: {
        rewardId: reward?.id,
      },
      enabled: Boolean(reward?.id && program?.id),
    });

  useEffect(() => {
    if (rewardPartners && rewardPartners.length > 0) {
      setValue(
        "partnerIds",
        rewardPartners.map((partner) => partner.id),
      );
    }
  }, [rewardPartners, setValue]);

  const { executeAsync: createReward, isPending: isCreating } = useAction(
    createRewardAction,
    {
      onSuccess: async () => {
        setIsOpen(false);
        toast.success("Reward created!");
        await mutateProgram();
        await mutatePrefix(`/api/programs/${program?.id}/rewards`);
      },
      onError({ error }) {
        toast.error(error.serverError);
      },
    },
  );

  const { executeAsync: updateReward, isPending: isUpdating } = useAction(
    updateRewardAction,
    {
      onSuccess: async () => {
        setIsOpen(false);
        toast.success("Reward updated!");
        await mutateProgram();
        await mutatePrefix(`/api/programs/${program?.id}/rewards`);
      },
      onError({ error }) {
        toast.error(error.serverError);
      },
    },
  );

  const { executeAsync: deleteReward, isPending: isDeleting } = useAction(
    deleteRewardAction,
    {
      onSuccess: async () => {
        setIsOpen(false);
        toast.success("Reward deleted!");
        await mutate(`/api/programs/${program?.id}`);
        await mutatePrefix(`/api/programs/${program?.id}/rewards`);
      },
      onError({ error }) {
        toast.error(error.serverError);
      },
    },
  );

  const onSubmit = async (data: FormData) => {
    if (!workspaceId || !program) {
      return;
    }

    const payload = {
      ...data,
      workspaceId,
      partnerIds,
      amount: type === "flat" ? data.amount * 100 : data.amount,
      maxDuration:
        Infinity === Number(data.maxDuration) ? null : data.maxDuration,
      maxAmount: data.maxAmount ? data.maxAmount * 100 : null,
    };

    if (!reward) {
      await createReward(payload);
    } else {
      await updateReward({
        ...payload,
        rewardId: reward.id,
      });
    }
  };

  const onDelete = async () => {
    if (!workspaceId || !program || !reward) {
      return;
    }

    if (!window.confirm("Are you sure you want to delete this reward?")) {
      return;
    }

    await deleteReward({
      workspaceId,
      rewardId: reward.id,
    });
  };

  const buttonDisabled =
    amount == null ||
    (selectedPartnerType === "specific" &&
      (!partnerIds || partnerIds.length === 0));

  const hasDefaultReward = !!program?.defaultRewardId;
  const displayPartners = !isDefault && selectedPartnerType === "specific";
  const canDeleteReward = reward && program?.defaultRewardId !== reward.id;

  return (
    <>
      <form
        ref={formRef}
        onSubmit={handleSubmit(onSubmit)}
        className="flex h-full flex-col"
      >
        <div className="flex items-start justify-between border-b border-neutral-200 p-6">
          <Sheet.Title className="text-xl font-semibold">
            {reward ? "Edit" : "Create"} {isDefault ? "default" : ""}{" "}
            {selectedEvent} reward
          </Sheet.Title>
          <Sheet.Close asChild>
            <Button
              variant="outline"
              icon={<X className="size-5" />}
              className="h-auto w-fit p-1"
            />
          </Sheet.Close>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-8 p-6">
            {isDefault && !hasDefaultReward && (
              <div className="grid grid-cols-1 space-y-4">
                <label className="text-sm font-medium text-neutral-800">
                  Reward type
                </label>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {DEFAULT_REWARD_TYPES.map((rewardType) => {
                    const isSelected = selectedEvent === rewardType.key;

                    const labelContent = (
                      <label
                        key={rewardType.label}
                        className={cn(
                          "relative flex w-full cursor-pointer items-start gap-0.5 rounded-md border border-neutral-200 bg-white p-3 text-neutral-600 hover:bg-neutral-50",
                          "transition-all duration-150",
                          isSelected &&
                            "border-black bg-neutral-50 text-neutral-900 ring-1 ring-black",
                        )}
                      >
                        <input
                          type="radio"
                          value={rewardType.label}
                          className="hidden"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setValue("event", rewardType.key);
                              setValue("type", "flat");
                            }
                          }}
                        />
                        <div className="flex grow flex-col text-sm">
                          <span className="font-medium">
                            {rewardType.label}
                          </span>
                          <span>{rewardType.description}</span>
                        </div>
                        <CircleCheckFill
                          className={cn(
                            "-mr-px -mt-px flex size-4 scale-75 items-center justify-center rounded-full opacity-0 transition-[transform,opacity] duration-150",
                            isSelected && "scale-100 opacity-100",
                          )}
                        />
                      </label>
                    );

                    return labelContent;
                  })}
                </div>
              </div>
            )}

            {!isDefault && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {PARTNER_TYPES.map((partnerType) => {
                  const isSelected = selectedPartnerType === partnerType.key;

                  const isDisabled =
                    (partnerType.key === "all" &&
                      ((selectedEvent === "click" &&
                        hasProgramWideClickReward) ||
                        (selectedEvent === "lead" &&
                          hasProgramWideLeadReward) ||
                        (selectedEvent === "sale" &&
                          hasProgramWideSaleReward))) ||
                    !!reward;

                  const tooltipContent = isDisabled
                    ? reward
                      ? "Partner type cannot be changed for existing rewards"
                      : `You can only have one program-wide ${selectedEvent} reward.`
                    : undefined;

                  const labelContent = (
                    <label
                      key={partnerType.label}
                      className={cn(
                        "relative flex w-full cursor-pointer items-start gap-0.5 rounded-md border border-neutral-200 bg-white p-3 text-neutral-600 hover:bg-neutral-50",
                        "transition-all duration-150",
                        isSelected &&
                          "border-black bg-neutral-50 text-neutral-900 ring-1 ring-black",
                        (isDisabled || !!reward) &&
                          "cursor-not-allowed opacity-60 hover:bg-white",
                      )}
                    >
                      <input
                        type="radio"
                        value={partnerType.label}
                        className="hidden"
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPartnerType(partnerType.key);

                            if (partnerType.key === "all") {
                              setValue("partnerIds", null);
                            }
                          }
                        }}
                      />
                      <div className="flex grow flex-col text-sm">
                        <span className="font-medium">{partnerType.label}</span>
                        <span>{partnerType.description}</span>
                      </div>
                      <CircleCheckFill
                        className={cn(
                          "-mr-px -mt-px flex size-4 scale-75 items-center justify-center rounded-full opacity-0 transition-[transform,opacity] duration-150",
                          isSelected && "scale-100 opacity-100",
                        )}
                      />
                    </label>
                  );

                  return isDisabled ? (
                    <Tooltip key={partnerType.label} content={tooltipContent}>
                      {labelContent}
                    </Tooltip>
                  ) : (
                    labelContent
                  );
                })}
              </div>
            )}

            {selectedEvent === "sale" && (
              <div className="grid grid-cols-1 space-y-4">
                <div>
                  <label className="text-sm font-medium text-neutral-800">
                    Commission structure
                  </label>
                  <p className="text-sm text-neutral-600">
                    Set how the affiliate will get rewarded
                  </p>
                </div>
                <div className="-m-1">
                  <AnimatedSizeContainer
                    height
                    transition={{ ease: "easeInOut", duration: 0.2 }}
                  >
                    <div className="flex flex-col gap-4 p-1">
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {COMMISSION_TYPES.map(
                          ({ label, description, value }) => {
                            const isSelected = value === commissionStructure;

                            return (
                              <label
                                key={label}
                                className={cn(
                                  "relative flex w-full cursor-pointer items-start gap-0.5 rounded-md border border-neutral-200 bg-white p-3 text-neutral-600 hover:bg-neutral-50",
                                  "transition-all duration-150",
                                  isSelected &&
                                    "border-black bg-neutral-50 text-neutral-900 ring-1 ring-black",
                                )}
                              >
                                <input
                                  type="radio"
                                  value={value}
                                  className="hidden"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setCommissionStructure(value);
                                      setValue(
                                        "maxDuration",
                                        value === "recurring"
                                          ? reward?.maxDuration || Infinity
                                          : 0,
                                      );
                                    }
                                  }}
                                />
                                <div className="flex grow flex-col text-sm">
                                  <span className="font-medium">{label}</span>
                                  <span>{description}</span>
                                </div>
                                <CircleCheckFill
                                  className={cn(
                                    "-mr-px -mt-px flex size-4 scale-75 items-center justify-center rounded-full opacity-0 transition-[transform,opacity] duration-150",
                                    isSelected && "scale-100 opacity-100",
                                  )}
                                />
                              </label>
                            );
                          },
                        )}
                      </div>

                      <div
                        className={cn(
                          "transition-opacity duration-200",
                          commissionStructure === "recurring"
                            ? "h-auto"
                            : "h-0 opacity-0",
                        )}
                        aria-hidden={commissionStructure !== "recurring"}
                        {...{
                          inert: commissionStructure !== "recurring",
                        }}
                      >
                        <div>
                          <label
                            htmlFor="duration"
                            className="text-sm font-medium text-neutral-800"
                          >
                            Duration
                          </label>
                          <div className="relative mt-2 rounded-md shadow-sm">
                            <select
                              className="block w-full rounded-md border-neutral-300 text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500 sm:text-sm"
                              {...register("maxDuration", {
                                valueAsNumber: true,
                              })}
                            >
                              {RECURRING_MAX_DURATIONS.filter(
                                (v) => v !== 0,
                              ).map((v) => (
                                <option value={v} key={v}>
                                  {v} {pluralize("month", Number(v))}
                                </option>
                              ))}
                              <option value={Infinity}>Lifetime</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </AnimatedSizeContainer>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-800">
                  Payout
                </label>
                <p className="text-sm text-neutral-600">
                  Set how much the affiliate will get rewarded
                </p>
              </div>

              {selectedEvent === "sale" && (
                <div>
                  <label
                    htmlFor="type"
                    className="text-sm font-medium text-neutral-800"
                  >
                    Payout model
                  </label>
                  <div className="relative mt-2 rounded-md shadow-sm">
                    <select
                      className="block w-full rounded-md border-neutral-300 text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500 sm:text-sm"
                      {...register("type", { required: true })}
                    >
                      <option value="flat">Flat</option>
                      <option value="percentage">Percentage</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="amount"
                  className="text-sm font-medium text-neutral-800"
                >
                  Amount{" "}
                  {selectedEvent !== "sale" ? `per ${selectedEvent}` : ""}
                </label>
                <div className="relative mt-2 rounded-md shadow-sm">
                  {type === "flat" && (
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-neutral-400">
                      $
                    </span>
                  )}
                  <input
                    className={cn(
                      "block w-full rounded-md border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500 sm:text-sm",
                      errors.amount &&
                        "border-red-600 focus:border-red-500 focus:ring-red-600",
                      type === "flat" ? "pl-6 pr-12" : "pr-7",
                    )}
                    {...register("amount", {
                      required: true,
                      valueAsNumber: true,
                      min: 0,
                      max: type === "flat" ? 1000 : 100,
                      onChange: handleMoneyInputChange,
                    })}
                    onKeyDown={handleMoneyKeyDown}
                  />
                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-neutral-400">
                    {type === "flat" ? "USD" : "%"}
                  </span>
                </div>
              </div>
            </div>

            {displayPartners && program?.id && (
              <RewardPartnersTable
                partnerIds={partnerIds || []}
                setPartnerIds={(value: string[]) => {
                  setValue("partnerIds", value);
                }}
                rewardPartners={rewardPartners || []}
                loading={isLoadingRewardPartners}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200 p-5">
          <div>
            {reward && (
              <Button
                type="button"
                variant="outline"
                text="Remove reward"
                onClick={onDelete}
                loading={isDeleting}
                disabled={!canDeleteReward || isCreating || isUpdating}
                disabledTooltip={
                  program?.defaultRewardId === reward.id
                    ? "This is a default reward and cannot be deleted."
                    : undefined
                }
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsOpen(false)}
              text="Cancel"
              className="w-fit"
              disabled={isCreating || isUpdating || isDeleting}
            />

            <Button
              type="submit"
              variant="primary"
              text={reward ? "Update reward" : "Create reward"}
              className="w-fit"
              loading={isCreating || isUpdating}
              disabled={
                buttonDisabled || isDeleting || isCreating || isUpdating
              }
              disabledTooltip={
                selectedPartnerType === "specific" &&
                (!partnerIds || partnerIds.length === 0)
                  ? "Please select at least one partner"
                  : undefined
              }
            />
          </div>
        </div>
      </form>
    </>
  );
}

// Temporarily hiding this in the UI for now – until more users ask for it
function RewardLimitSection({
  event,
  register,
  watch,
  setValue,
  errors,
}: {
  event: EventType;
  register: UseFormRegister<FormData>;
  watch: UseFormWatch<FormData>;
  setValue: UseFormSetValue<FormData>;
  errors: FieldErrors<FormData>;
}) {
  const [maxAmount] = watch(["maxAmount"]);
  const [isLimited, setIsLimited] = useState(maxAmount !== null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Switch
          checked={isLimited}
          trackDimensions="radix-state-checked:bg-neutral-900 radix-state-unchecked:bg-neutral-200"
          fn={(checked: boolean) => {
            setIsLimited(checked);

            if (!checked) {
              setValue("maxAmount", null);
            }
          }}
        />
        <span className="text-sm font-medium text-neutral-800">
          Limit {event} rewards
        </span>
        <InfoTooltip content="Limit how much a partner can receive payouts." />
      </div>

      <div className="-m-1">
        <AnimatedSizeContainer
          height
          transition={{ ease: "easeInOut", duration: 0.2 }}
        >
          {isLimited && (
            <div className="p-1">
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-800">
                    Reward limit
                  </label>
                  <div className="relative mt-2 rounded-md shadow-sm">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-neutral-400">
                      $
                    </span>
                    <input
                      className={cn(
                        "block w-full rounded-md border-neutral-300 pl-6 pr-12 text-neutral-900 placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500 sm:text-sm",
                        errors.maxAmount &&
                          "border-red-600 focus:border-red-500 focus:ring-red-600",
                      )}
                      {...register("maxAmount", {
                        required: isLimited,
                        valueAsNumber: true,
                        min: 0,
                        onChange: handleMoneyInputChange,
                      })}
                      onKeyDown={handleMoneyKeyDown}
                      placeholder="0"
                    />
                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-neutral-400">
                      USD
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </AnimatedSizeContainer>
      </div>
    </div>
  );
}

export function RewardSheet({
  isOpen,
  nested,
  ...rest
}: RewardSheetProps & {
  isOpen: boolean;
  nested?: boolean;
}) {
  return (
    <Sheet open={isOpen} onOpenChange={rest.setIsOpen} nested={nested}>
      <RewardSheetContent {...rest} />
    </Sheet>
  );
}

export function useRewardSheet(
  props: { nested?: boolean } & Omit<RewardSheetProps, "setIsOpen">,
) {
  const [isOpen, setIsOpen] = useState(false);

  return {
    RewardSheet: (
      <RewardSheet setIsOpen={setIsOpen} isOpen={isOpen} {...props} />
    ),
    setIsOpen,
  };
}
