import Strands from '@/components/Strands'
import ElectricBorder from '@/components/ElectricBorder'

// background, headline and card shared by the auth pages
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#101010]">
      <div className="absolute inset-0 pointer-events-none">
        <Strands
          colors={['#ff2a2a', '#2a7fff', '#2aff2a']}
          count={3}
          speed={0.15}
          amplitude={0.6}
          thickness={0.5}
          glow={2}
          intensity={0.4}
          saturation={1.1}
          scale={1}
          glass={true}
          refraction={1.2}
          dispersion={1.4}
          glassSize={0.45}
        />
      </div>

      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-full px-6 text-center z-10 pointer-events-none animate-hero-in lg:top-1/2 lg:-translate-y-1/2 lg:left-16 lg:translate-x-0 lg:w-auto lg:max-w-sm lg:text-left">
        <p className="font-display font-light text-3xl sm:text-4xl lg:text-5xl leading-[0.95] text-[#fffdf9]">
          Ask <span className="italic text-[#847dff]">anything</span>
          <br />about your documents
        </p>
      </div>

      <ElectricBorder
        color="#c99a5b"
        speed={0.6}
        chaos={0.08}
        borderRadius={16}
        style={{ width: '100%', maxWidth: '24rem' }}
        className="relative z-10 mx-4"
      >
        <div className="space-y-4 bg-obsidian/85 backdrop-blur-sm border border-ash rounded-2xl p-8">
          {children}
        </div>
      </ElectricBorder>
    </div>
  )
}
