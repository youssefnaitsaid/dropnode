import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExportDialogComponent } from './export-dialog';

describe('ExportDialogComponent', () => {
  let fixture: ComponentFixture<ExportDialogComponent>;
  let component: ExportDialogComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExportDialogComponent],
    });
    fixture = TestBed.createComponent(ExportDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.close();
  });

  it('opens as an accessible dialog with focus containment', () => {
    component.open();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Export as');
    expect(dialog?.getAttribute('cdktrapfocus')).not.toBeNull();
  });

  it('switches formats when unconstrained', () => {
    component.open();
    fixture.detectChanges();
    expect(component.format()).toBe('png');

    component.setFormat('json');
    fixture.detectChanges();
    expect(component.format()).toBe('json');
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
