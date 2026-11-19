import React, { useLayoutEffect, useRef } from 'react';
import { Button as MoonstoneButton } from '@jahia/moonstone';

type ButtonProps = React.ComponentProps<typeof MoonstoneButton>;

const FORWARD_REF = Symbol.for('react.forward_ref');

const assignRef = <T, >(ref: React.ForwardedRef<T>, value: T | null) => {
    if (typeof ref === 'function') {
        ref(value);
    } else if (ref) {
        ref.current = value;
    }
};

// The Button of Moonstone 2.21 and earlier takes no ref: this one gives the ref the <button> it renders.
// `display: contents` keeps the wrapper out of the layout.
const RefButton = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
    const holder = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        assignRef(ref, holder.current?.firstElementChild as HTMLButtonElement ?? null);
        return () => assignRef(ref, null);
    }, [ref]);

    return (
        <span ref={holder} style={{ display: 'contents' }}>
            <MoonstoneButton {...props}/>
        </span>
    );
});

RefButton.displayName = 'RefButton';

/** The Button of Moonstone, with a ref on its <button> */
export const Button = (MoonstoneButton as unknown as { $$typeof?: symbol }).$$typeof === FORWARD_REF
    ? MoonstoneButton as unknown as typeof RefButton
    : RefButton;
