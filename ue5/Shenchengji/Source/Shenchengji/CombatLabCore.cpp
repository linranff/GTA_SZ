#include "CombatLabCore.h"
#include "WalkerPawn.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "UObject/ConstructorHelpers.h"

AShenchengjiCombatLabGameMode::AShenchengjiCombatLabGameMode()
{
	Weapon = FShenchengjiCombatWeapon();
	DefaultPawnClass = AShenchengjiWalker::StaticClass();
}

void AShenchengjiCombatLabGameMode::StartPlay()
{
	Super::StartPlay();
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AActor* Range = World->SpawnActor<AActor>(AActor::StaticClass(), FTransform::Identity, Params);
	if (!Range || !Cube)
	{
		UE_LOG(LogTemp, Display, TEXT("战斗试验场已启动，都市生活未加载。"));
		return;
	}
	USceneComponent* Root = NewObject<USceneComponent>(Range);
	Root->RegisterComponent();
	Range->SetRootComponent(Root);

	auto Place = [&](const FVector& Location, const FVector& Scale)
	{
		UStaticMeshComponent* Mesh = NewObject<UStaticMeshComponent>(Range);
		Mesh->SetStaticMesh(Cube);
		Mesh->SetupAttachment(Root);
		Mesh->SetWorldLocation(Location);
		Mesh->SetWorldScale3D(Scale);
		Mesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
		Mesh->RegisterComponent();
	};

	Place(FVector(0.f, 0.f, -50.f), FVector(40.f, 40.f, 1.f));
	Place(FVector(1200.f, 0.f, 100.f), FVector(1.f, 2.f, 2.f));
	Place(FVector(1400.f, 300.f, 100.f), FVector(1.f, 2.f, 2.f));
	Place(FVector(1400.f, -300.f, 100.f), FVector(1.f, 2.f, 2.f));
	UE_LOG(LogTemp, Display, TEXT("战斗试验场：%s  都市生活未加载"), *Weapon.Name);
}
