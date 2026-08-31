<script lang="ts">
  import {
    fetchCourses,
    formatSchoolYear,
    formatTerm,
    type CourseSummary,
  } from './records'

  /**
   * The student's courses.
   *
   * The 2024 screen was a flat list of `COURSE CODE | Course Name` with a View
   * button on each row, and that is what this is. The school year and term
   * underneath are the one addition: the list runs across every year a student
   * has been enrolled, so without them a retaken course appears twice with
   * nothing to tell the two apart.
   */

  let { onopen }: { onopen: (recordId: number) => void } = $props()

  let courses = $state<CourseSummary[]>([])
  let error = $state('')
  let loading = $state(true)

  async function load() {
    loading = true
    error = ''

    const result = await fetchCourses()

    if (result.ok) {
      courses = result.data.records
    } else {
      error = result.message
    }

    loading = false
  }

  load()
</script>

<section class="mx-auto w-full max-w-3xl px-6 py-8">
  <h1 class="text-xl font-bold tracking-tight">My courses</h1>

  {#if loading}
    <p class="mt-6 text-sm muted">Loading your courses…</p>
  {:else if error}
    <div class="mt-6 alert alert-error" role="alert">
      <p>{error}</p>
      <button class="link mt-1" onclick={load}>Try again</button>
    </div>
  {:else if courses.length === 0}
    <div class="mt-6 alert alert-info">
      You are not enrolled in any class record yet. Your instructor adds you to
      one when the term starts.
    </div>
  {:else}
    <ul class="mt-6 card divide-y divide-border">
      {#each courses as course (course.id)}
        <li class="group flex items-center gap-4 px-4 py-3">
          <div class="min-w-0">
            <p class="truncate text-sm">
              <span class="font-semibold">{course.course_code}</span>
              <span class="muted"> | </span>
              {course.course_name}
            </p>
            <p class="truncate text-xs muted">
              {formatTerm(course.term)} · SY {formatSchoolYear(course)}
            </p>
          </div>

          <button class="btn btn-secondary btn-sm ml-auto" onclick={() => onopen(course.id)}>
            View
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
