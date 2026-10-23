import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Numeric, ValidityContext } from './Fields';
describe('Numeric giriş davranışı', () => {
  it('virgüllü değeri standart sayıya aktarır, geçersiz girişi hesaba sokmaz', () => {
    const changed = vi.fn();
    const validity = vi.fn();
    render(
      <ValidityContext.Provider value={validity}>
        <Numeric label="Kütle" unit="kg" value={40} min={0.01} onValue={changed} />
      </ValidityContext.Provider>,
    );
    const input = screen.getByLabelText('Kütle kg');
    fireEvent.change(input, { target: { value: '40,5' } });
    expect(changed).toHaveBeenLastCalledWith(40.5);
    fireEvent.change(input, { target: { value: 'yanlış' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(validity.mock.calls.some(([, invalid]) => invalid === true)).toBe(true);
  });
  it('ondalık yazılırken kullanıcının ayırıcısını korur', () => {
    function Form() {
      const [value, setValue] = useState(40);
      return <Numeric label="Kütle" unit="kg" value={value} onValue={setValue} />;
    }
    render(<Form />);
    const input = screen.getByLabelText('Kütle kg');
    fireEvent.change(input, { target: { value: '40,' } });
    fireEvent.change(input, { target: { value: '40,25' } });
    expect(input).toHaveValue('40,25');
  });
});
