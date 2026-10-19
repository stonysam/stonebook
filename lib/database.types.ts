// Database types for the tables and views the app uses. Generated from the live
// schema (Supabase) and trimmed; relationships are omitted because the app joins in code.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemberRole = 'parent' | 'member' | 'junior' | 'child';
export type Visibility = 'shared' | 'personal' | 'private';
export type FieldKind = 'text' | 'number' | 'date' | 'choice' | 'person';
export type RuleKindDb = 'interval' | 'meter' | 'fixed_date' | 'weekly' | 'record';

type Table<Row, Insert, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
type View<Row> = { Row: Row; Relationships: [] };

export type MemberRow = { id: string; display_name: string; role: MemberRole; email: string | null; auth_user_id: string | null; created_at: string };
export type ObjectTypeRow = { id: string; name: string; icon: string | null; sort_order: number; confirm_kid_logs: boolean; assignable: boolean; created_at: string };
export type FieldDefRow = { id: string; object_type_id: string; key: string; label: string; kind: FieldKind; options: Json | null; required: boolean; sort_order: number };
export type ObjectRow = {
  id: string; object_type_id: string; name: string; owner_id: string; visibility: Visibility; share_with_family: boolean;
  field_values: Json; archived_at: string | null; created_by: string | null; created_at: string;
};
export type EventRow = {
  id: string; object_id: string; kind: string; occurred_on: string; meter_value: number | null; meter_unit: string | null;
  data: Json; note: string | null; correction_of: string | null; voided: boolean; created_by: string | null; created_at: string;
  needs_confirmation: boolean; root_id: string; rule_id: string | null;
};
export type RuleRow = {
  id: string; object_id: string; name: string; kind: RuleKindDb; event_kind: string | null; every_months: number | null;
  every_days: number | null; meter_every: number | null; meter_unit: string | null; due_on: string | null;
  renew_every_months: number | null; starts_on: string | null; meter_start: number | null; weekdays: number[] | null;
  owner_id: string; lead_days: number[]; overdue_repeat_days: number; active: boolean; created_by: string | null; created_at: string;
};
export type ActivitySlotRow = {
  id: string; object_id: string; weekdays: number[]; starts_at: string; ends_at: string | null;
  drop_off_by: string | null; pick_up_by: string | null; active: boolean; created_by: string | null; created_at: string;
};
export type ActivityChangeRow = {
  slot_id: string; on_date: string; cancelled: boolean; drop_off_by: string | null; pick_up_by: string | null;
  note: string | null; changed_by: string | null; changed_at: string;
};
export type PushSubscriptionRow = { endpoint: string; member_id: string; p256dh: string; auth: string; device: string | null; created_at: string };
export type CalendarLinkRow = { member_id: string; token: string; created_at: string };
export type ConfirmationRow = { event_id: string; approved: boolean; decided_by: string; decided_at: string; note: string | null };
export type ReactionRow = { event_id: string; member_id: string; emoji: string; created_at: string };
export type FeedSeenRow = { member_id: string; seen_at: string };
export type AwaitingRow = {
  event_id: string; object_id: string; object_name: string; kind: string; occurred_on: string; note: string | null;
  created_by: string | null; created_at: string; assigned_by: string | null;
};
export type FeedRow = {
  id: string; event_id: string; object_id: string; object_name: string; kind: string; occurred_on: string; note: string | null;
  created_by: string | null; announced_at: string; reactions: { emoji: string; member_id: string }[];
};

type Opt<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  public: {
    Tables: {
      members: Table<MemberRow, Opt<MemberRow, 'id' | 'email' | 'auth_user_id' | 'created_at'>>;
      object_types: Table<ObjectTypeRow, Opt<ObjectTypeRow, 'id' | 'icon' | 'sort_order' | 'confirm_kid_logs' | 'assignable' | 'created_at'>>;
      field_defs: Table<FieldDefRow, Opt<FieldDefRow, 'id' | 'options' | 'required' | 'sort_order'>>;
      objects: Table<ObjectRow, Opt<ObjectRow, 'id' | 'visibility' | 'share_with_family' | 'field_values' | 'archived_at' | 'created_by' | 'created_at'>>;
      events: Table<EventRow, Opt<EventRow, 'id' | 'meter_value' | 'meter_unit' | 'data' | 'note' | 'correction_of' | 'voided' | 'created_at' | 'needs_confirmation' | 'rule_id'>>;
      rules: Table<RuleRow, Opt<RuleRow, 'id' | 'event_kind' | 'every_months' | 'every_days' | 'meter_every' | 'meter_unit' | 'due_on' | 'renew_every_months' | 'starts_on' | 'meter_start' | 'weekdays' | 'lead_days' | 'overdue_repeat_days' | 'active' | 'created_by' | 'created_at'>>;
      activity_slots: Table<ActivitySlotRow, Opt<ActivitySlotRow, 'id' | 'ends_at' | 'drop_off_by' | 'pick_up_by' | 'active' | 'created_by' | 'created_at'>>;
      activity_changes: Table<ActivityChangeRow, Opt<ActivityChangeRow, 'cancelled' | 'drop_off_by' | 'pick_up_by' | 'note' | 'changed_by' | 'changed_at'>>;
      push_subscriptions: Table<PushSubscriptionRow, Opt<PushSubscriptionRow, 'device' | 'created_at'>>;
      calendar_links: Table<CalendarLinkRow, Opt<CalendarLinkRow, 'created_at'>>;
      confirmations: Table<ConfirmationRow, Opt<ConfirmationRow, 'decided_at' | 'note'>>;
      reactions: Table<ReactionRow, Opt<ReactionRow, 'created_at'>>;
      feed_seen: Table<FeedSeenRow, Opt<FeedSeenRow, 'seen_at'>>;
    };
    Views: {
      effective_events: View<EventRow>;
      awaiting_confirmation: View<AwaitingRow>;
      family_feed: View<FeedRow>;
    };
    Functions: {
      claim_membership: { Args: never; Returns: string };
      save_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_device: string }; Returns: undefined };
      calendar_link_reset: { Args: never; Returns: string };
      calendar_data: { Args: { p_token: string }; Returns: Json };
      push_public_key: { Args: never; Returns: string | null };
      set_pin: { Args: { p_member: string; p_pin: string }; Returns: undefined };
      pins_set: { Args: never; Returns: string[] };
      child_log: { Args: { p_child: string; p_pin: string; p_object: string; p_rule: string }; Returns: Json };
      check_parent_pin: { Args: { p_pin: string }; Returns: string };
    };
    Enums: { member_role: MemberRole; visibility: Visibility; field_kind: FieldKind; rule_kind: RuleKindDb };
    CompositeTypes: Record<string, never>;
  };
};
