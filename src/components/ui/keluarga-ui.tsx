import type { ComponentProps, ComponentPropsWithoutRef, ReactNode } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Checkbox,
  Drawer,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  type ActionIconProps,
  type BadgeProps,
  type ButtonProps,
} from "@mantine/core";

export type KButtonProps = ButtonProps & ComponentPropsWithoutRef<"button">;
export type KActionIconProps = ActionIconProps;
export type KTextInputProps = ComponentProps<typeof TextInput>;
export type KTextareaProps = ComponentProps<typeof Textarea>;
export type KNumberInputProps = ComponentProps<typeof NumberInput>;
export type KSelectProps = ComponentProps<typeof Select>;
export type KCheckboxProps = ComponentProps<typeof Checkbox>;
export type KRadioProps = ComponentProps<typeof Radio>;
export type KSwitchProps = ComponentProps<typeof Switch>;
export type KBadgeProps = BadgeProps;
export type KAlertProps = ComponentProps<typeof Alert>;
export type KModalProps = ComponentProps<typeof Modal>;
export type KDrawerProps = ComponentProps<typeof Drawer>;
export type KMenuProps = ComponentProps<typeof Menu>;

export function KButton({ radius = "md", size = "sm", ...props }: KButtonProps) {
  return <Button radius={radius} size={size} {...props} />;
}

export function KActionIcon({ radius = "md", size = 36, ...props }: KActionIconProps) {
  return <ActionIcon radius={radius} size={size} {...props} />;
}

export function KTextInput({ radius = "md", size = "sm", ...props }: KTextInputProps) {
  return <TextInput radius={radius} size={size} {...props} />;
}

export function KTextarea({ minRows = 2, radius = "md", size = "sm", ...props }: KTextareaProps) {
  return <Textarea minRows={minRows} radius={radius} size={size} {...props} />;
}

export function KNumberInput({ radius = "md", size = "sm", ...props }: KNumberInputProps) {
  return <NumberInput radius={radius} size={size} {...props} />;
}

export function KSelect({ radius = "md", size = "sm", ...props }: KSelectProps) {
  return <Select radius={radius} size={size} {...props} />;
}

export function KCheckbox({ radius = "sm", size = "sm", ...props }: KCheckboxProps) {
  return <Checkbox radius={radius} size={size} {...props} />;
}

export function KRadio({ size = "sm", ...props }: KRadioProps) {
  return <Radio size={size} {...props} />;
}

export function KSwitch({ radius = "xl", size = "sm", ...props }: KSwitchProps) {
  return <Switch radius={radius} size={size} {...props} />;
}

export function KBadge({ radius = "sm", size = "sm", variant = "light", ...props }: KBadgeProps) {
  return <Badge radius={radius} size={size} variant={variant} {...props} />;
}

export function KAlert({ radius = "md", variant = "light", ...props }: KAlertProps) {
  return <Alert radius={radius} variant={variant} {...props} />;
}

export function KModal({ centered = true, radius = "lg", size = "sm", ...props }: KModalProps) {
  return <Modal centered={centered} radius={radius} size={size} {...props} />;
}

export function KDrawer({ padding = "md", position = "bottom", radius = "lg", ...props }: KDrawerProps) {
  return <Drawer padding={padding} position={position} radius={radius} {...props} />;
}

export function KMenu({ shadow = "md", width = 220, ...props }: KMenuProps) {
  return <Menu shadow={shadow} width={width} {...props} />;
}

export function KLoadingState({ label = "Loading…" }: { label?: ReactNode }) {
  return (
    <Center mih={120}>
      <Stack align="center" gap="xs">
        <Loader size="sm" />
        <Text c="dimmed" size="sm">{label}</Text>
      </Stack>
    </Center>
  );
}

export function KEmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Center mih={120} px="md" py="lg">
      <Stack align="center" gap={6} maw={420} ta="center">
        <Text fw={700} size="sm">{title}</Text>
        {description ? <Text c="dimmed" size="sm">{description}</Text> : null}
        {action}
      </Stack>
    </Center>
  );
}

export function KErrorState({
  title = "Something went wrong",
  message,
}: {
  title?: ReactNode;
  message?: ReactNode;
}) {
  return (
    <KAlert color="red" title={title}>
      {message ?? "Try again. If the problem persists, contact the app administrator."}
    </KAlert>
  );
}
