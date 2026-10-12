-- One application per freelancer (every read assumes it; the retake replaces the report, not the application).
alter table applications add constraint applications_one_per_freelancer unique (freelancer_user_id);
