import { Schema } from "effect";

// Wire format for live updates. It mirrors fate's live connector contract
// (subscribe by id and topic, receive events tagged with the subscription id)
// so fate can use this transport later without changes on either side.

export const ClientMessage = Schema.Union([
  Schema.Struct({
    op: Schema.Literal("subscribe"),
    id: Schema.String.check(Schema.isMaxLength(64)),
    topic: Schema.String.check(Schema.isMaxLength(200)),
  }),
  Schema.Struct({ op: Schema.Literal("unsubscribe"), id: Schema.String }),
]);
export type ClientMessage = typeof ClientMessage.Type;

export const LiveEvent = Schema.Struct({
  subscriptionId: Schema.String,
  topic: Schema.String,
  type: Schema.Literals(["update", "delete"]),
  data: Schema.Struct({
    id: Schema.String,
    changed: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
});
export type LiveEvent = typeof LiveEvent.Type;

// Same format as fate's liveEntityTopic, so fate subscriptions match ours.
export const entityTopic = (type: string, id: string) =>
  `entity:${encodeURIComponent(type)}:${encodeURIComponent(id)}`;
