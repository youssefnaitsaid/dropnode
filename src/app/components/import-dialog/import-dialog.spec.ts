import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImportDialogComponent } from './import-dialog';

describe('ImportDialogComponent', () => {
  let fixture: ComponentFixture<ImportDialogComponent>;
  let component: ImportDialogComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ImportDialogComponent],
    });
    fixture = TestBed.createComponent(ImportDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.close();
  });

  it('opens as an accessible dialog and resets pasted text and errors', () => {
    component.jsonText = 'stale json';
    component.errorMessage.set('stale error');
    component.open();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(component.jsonText).toBe('');
    expect(component.errorMessage()).toBeNull();
  });

  it('shows the Paste JSON textarea only on the text tab', () => {
    component.open();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();

    component.activeTab.set('text');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea')).not.toBeNull();
  });

  it('closes on Escape while open', () => {
    component.open();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('ignores Escape while closed', () => {
    expect(component.isOpen()).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);
  });
});
