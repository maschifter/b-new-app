import { type ComponentRef, forwardRef } from "react";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

export interface BouncablePressProps extends Omit<PressableProps, "style"> {
  className?: string;
  bounce?: boolean;
  scaleIn?: number;
  scaleOut?: number;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type BouncablePressRef = ComponentRef<typeof AnimatedPressable>;

const AnimatedBouncablePress = forwardRef<BouncablePressRef, BouncablePressProps>(
  (
    {
      bounce: _bounce,
      className,
      scaleIn = 0.96,
      scaleOut = 1,
      style,
      onPressIn,
      onPressOut,
      ...props
    },
    ref,
  ) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <AnimatedPressable
        ref={ref}
        className={className}
        onPressIn={(event) => {
          scale.value = withSpring(scaleIn);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          scale.value = withSpring(scaleOut);
          onPressOut?.(event);
        }}
        style={[animatedStyle, style]}
        {...props}
      />
    );
  },
);

AnimatedBouncablePress.displayName = "AnimatedBouncablePress";

const PlainBouncablePress = forwardRef<BouncablePressRef, BouncablePressProps>(
  ({ bounce: _bounce, scaleIn: _scaleIn, scaleOut: _scaleOut, ...props }, ref) => (
    <Pressable ref={ref} {...props} />
  ),
);

PlainBouncablePress.displayName = "PlainBouncablePress";

export const BouncablePress = forwardRef<BouncablePressRef, BouncablePressProps>(
  ({ bounce = true, ...props }, ref) =>
    bounce ? (
      <AnimatedBouncablePress ref={ref} {...props} />
    ) : (
      <PlainBouncablePress ref={ref} {...props} />
    ),
);

BouncablePress.displayName = "BouncablePress";
